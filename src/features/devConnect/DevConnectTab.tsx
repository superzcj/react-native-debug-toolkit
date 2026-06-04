import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { DebugFeatureRenderProps } from '../../types';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import {
  buildDeviceDaemonEndpoint,
  daemonClient,
  getDefaultDaemonEndpoint,
  normalizeDaemonSettings,
  type DaemonSettings,
} from '../../utils/DaemonClient';
import {
  DEFAULT_DAEMON_PORT,
  buildDaemonDeviceHost,
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
} from './devConnectUtils';
import {
  saveComputerHost,
  saveComputerTarget,
  saveDaemonPort,
} from './devConnectPreferences';
import type { DevConnectFeatureControls, DevConnectSettingsPatch, DevConnectState } from './types';

const CONNECTION_TIMEOUT_MS = 2000;

type SyncUiState = 'idle' | 'checking' | 'connected' | 'retrying' | 'failed' | 'running';

function getSimulatorHost(): string {
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

export function DevConnectTab({ snapshot, feature }: DebugFeatureRenderProps<DevConnectState>) {
  const inputRef = useRef<TextInput>(null);
  const [computerHost, setComputerHost] = useState(snapshot.computerHost);
  const [daemonPort, setDaemonPort] = useState(snapshot.daemonPort);
  const [streaming, setStreaming] = useState(snapshot.streaming);
  const [syncState, setSyncState] = useState<SyncUiState>(snapshot.streaming ? 'running' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const isSim = snapshot.isSimulator;

  const updateFeatureSettings = useCallback((patch: DevConnectSettingsPatch) => {
    (feature as unknown as DevConnectFeatureControls).updateSettings?.(patch);
  }, [feature]);

  useEffect(() => {
    setComputerHost(snapshot.computerHost);
  }, [snapshot.computerHost]);

  useEffect(() => {
    setDaemonPort(snapshot.daemonPort);
  }, [snapshot.daemonPort]);

  useEffect(() => {
    setStreaming(snapshot.streaming);
    setSyncState(snapshot.streaming ? 'running' : 'idle');
  }, [snapshot.streaming]);

  const handleHostChange = useCallback((value: string) => {
    setComputerHost(value);
    const target = parseComputerTarget(value);
    if (target) {
      saveComputerTarget(value)
        .then((savedTarget) => {
          if (savedTarget) {
            updateFeatureSettings({
              computerHost: savedTarget.computerHost,
            });
          }
        })
        .catch(() => {});
    }
    setSyncState((prev) => (prev === 'failed' ? 'idle' : prev));
    setMessage(null);
  }, [updateFeatureSettings]);

  const handleDaemonPortChange = useCallback((value: string) => {
    setDaemonPort(value);
    const normalized = normalizePort(value);
    if (normalized) {
      saveDaemonPort(normalized)
        .then(() => updateFeatureSettings({ daemonPort: normalized }))
        .catch(() => {});
    }
    setMessage(null);
  }, [updateFeatureSettings]);

  const persistConnectionSettings = useCallback(async (): Promise<boolean> => {
    const normalizedDaemonPort = normalizePort(daemonPort);
    if (!normalizedDaemonPort) {
      setMessage('Enter a valid desktop logs port.');
      return false;
    }

    const patch: DevConnectSettingsPatch = { daemonPort: normalizedDaemonPort };
    const writes: Array<Promise<unknown>> = [saveDaemonPort(normalizedDaemonPort)];
    setDaemonPort(normalizedDaemonPort);

    if (!isSim) {
      const normalizedHost = normalizeComputerHost(computerHost);
      if (!normalizedHost) {
        setMessage('Enter your computer IP first.');
        return false;
      }
      patch.computerHost = normalizedHost;
      writes.push(saveComputerHost(normalizedHost));
      setComputerHost(normalizedHost);
    }

    await Promise.all(writes);
    updateFeatureSettings(patch);
    return true;
  }, [computerHost, daemonPort, isSim, updateFeatureSettings]);

  const validateSettings = useCallback((): boolean => {
    if (!isSim && !normalizeComputerHost(computerHost)) {
      setMessage('Enter your computer IP first.');
      return false;
    }
    if (!normalizePort(daemonPort)) {
      setMessage('Enter a valid desktop logs port.');
      return false;
    }
    return true;
  }, [computerHost, daemonPort, isSim]);

  const configureDaemon = useCallback(() => {
    const normalizedHost = isSim ? '' : (normalizeComputerHost(computerHost) ?? '');
    const normalizedDaemonPort = normalizePort(daemonPort) ?? DEFAULT_DAEMON_PORT;
    const deviceHost = isSim ? '' : buildDaemonDeviceHost(normalizedHost, normalizedDaemonPort);
    const settings: DaemonSettings = {
      mode: isSim ? 'simulator' : 'device',
      endpoint: '',
      deviceHost,
      token: '',
    };
    daemonClient.configure(settings);
    const normalized = normalizeDaemonSettings(settings);
    const endpoint = normalized.endpoint || (isSim ? getDefaultDaemonEndpoint() : buildDeviceDaemonEndpoint(deviceHost));
    return { ...normalized, endpoint };
  }, [computerHost, daemonPort, isSim]);

  const toggleLiveSync = useCallback(async () => {
    if (streaming) {
      daemonClient.disconnect();
      daemonClient.setStreamingEnabled(false);
      setStreaming(false);
      setSyncState('idle');
      setMessage(null);
      return;
    }

    if (!validateSettings()) {
      return;
    }
    if (!(await persistConnectionSettings())) {
      return;
    }

    const daemonOptions = configureDaemon();
    setMessage('Checking desktop connection...');
    setSyncState('checking');

    const connection = await daemonClient.checkConnection({
      ...daemonOptions,
      timeoutMs: CONNECTION_TIMEOUT_MS,
    });
    if (!connection.ok) {
      setStreaming(false);
      setSyncState('failed');
      setMessage('Cannot reach desktop. Try /health in phone browser.');
      return;
    }

    daemonClient.setStreamingEnabled(true);
    daemonClient.connect({
      ...daemonOptions,
      timeoutMs: 3000,
      onStatus: (status) => {
        if (status.state === 'connected') {
          setStreaming(true);
          setSyncState('connected');
          setMessage(null);
        } else if (status.state === 'retrying') {
          setSyncState('retrying');
          setMessage('Desktop not reachable. Retrying...');
        } else if (status.state === 'failed') {
          setStreaming(false);
          setSyncState('failed');
          setMessage(status.reason === 'auth' ? 'Desktop token rejected.' : 'Desktop not reachable after multiple retries.');
        } else {
          setSyncState('checking');
        }
      },
    });
    setStreaming(true);
  }, [configureDaemon, persistConnectionSettings, streaming, validateSettings]);

  const sendOnce = useCallback(async () => {
    if (!validateSettings()) {
      return;
    }
    if (!(await persistConnectionSettings())) {
      return;
    }

    const daemonOptions = configureDaemon();
    setSending(true);
    setMessage('Checking desktop connection...');

    try {
      const connection = await daemonClient.checkConnection({
        ...daemonOptions,
        timeoutMs: CONNECTION_TIMEOUT_MS,
      });
      if (!connection.ok) {
        setMessage('Cannot reach desktop. Try /health in phone browser.');
        return;
      }

      setMessage('Sending logs...');
      const result = await daemonClient.reportOnce({
        ...daemonOptions,
        timeoutMs: 2000,
      });

      if (result.ok) {
        const totalLogs = Object.values(result.logCount ?? {}).reduce((total, count) => total + count, 0);
        setMessage(`Sent ${totalLogs} logs.`);
      } else {
        setMessage(result.error ? `Send failed: ${result.error}` : 'Send failed.');
      }
    } finally {
      setSending(false);
    }
  }, [configureDaemon, persistConnectionSettings, validateSettings]);

  const canConnect = isSim || (Boolean(normalizeComputerHost(computerHost)) && Boolean(normalizePort(daemonPort)));
  const busy = sending || syncState === 'checking';
  const subnetPrefix = snapshot.subnetPrefix;
  const ipPlaceholder = subnetPrefix ? `${subnetPrefix}...` : '192.168.1.10';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {isSim ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Simulator/emulator - using {getSimulatorHost()}</Text>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.label}>Computer IP</Text>
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={computerHost}
                onChangeText={handleHostChange}
                placeholder={ipPlaceholder}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                onSubmitEditing={() => inputRef.current?.blur()}
                editable={!streaming}
              />
            </View>
            {subnetPrefix && !computerHost ? (
              <TouchableOpacity
                style={styles.subnetHint}
                onPress={() => {
                  setComputerHost(subnetPrefix);
                  inputRef.current?.focus();
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.subnetHintText}>Tap to fill: {subnetPrefix}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Desktop Logs Port</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={daemonPort}
              onChangeText={handleDaemonPortChange}
              placeholder={DEFAULT_DAEMON_PORT}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              returnKeyType="done"
            />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, (!canConnect || busy) && styles.buttonDisabled]}
            onPress={toggleLiveSync}
            disabled={!canConnect || busy}
            activeOpacity={0.75}
          >
            <Text style={styles.primaryButtonText}>
              {streaming ? 'Stop' : busy ? 'Checking...' : 'Live Sync'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, (!canConnect || busy) && styles.buttonDisabled]}
            onPress={sendOnce}
            disabled={!canConnect || busy}
            activeOpacity={0.75}
          >
            <Text style={styles.secondaryButtonText}>
              {sending ? 'Sending...' : 'Send Once'}
            </Text>
          </TouchableOpacity>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.LG, paddingTop: Spacing.MD, paddingBottom: Spacing.XXL },
  badge: {
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    borderRadius: Radius.MD,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryDim,
    marginBottom: Spacing.MD,
  },
  badgeText: { fontSize: FontSize.MD, fontWeight: FontWeight.medium, color: Colors.primary },
  section: { marginBottom: Spacing.MD },
  label: { fontSize: FontSize.SM, fontWeight: FontWeight.medium, color: Colors.textSecondary, marginBottom: Spacing.XXS },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  subnetHint: { marginTop: Spacing.XXS },
  subnetHintText: { fontSize: FontSize.XS, color: Colors.primary, fontWeight: FontWeight.medium },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.MD,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    fontSize: FontSize.MD,
    color: Colors.text,
    fontFamily: 'Courier',
  },
  actions: { flexDirection: 'row', gap: Spacing.SM, marginTop: Spacing.XXS, marginBottom: Spacing.MD },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.SM + 1,
    borderRadius: Radius.LG,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: { color: Colors.textInverse, fontSize: FontSize.MD, fontWeight: FontWeight.semibold },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.SM + 1,
    borderRadius: Radius.LG,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: { color: Colors.primary, fontSize: FontSize.MD, fontWeight: FontWeight.semibold },
  buttonDisabled: { opacity: 0.5 },
  message: { fontSize: FontSize.XS, lineHeight: 17, color: Colors.textSecondary, marginBottom: Spacing.MD },
});
