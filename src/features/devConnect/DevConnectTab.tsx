import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { copyToComputer } from '../../utils/copyToComputer';
import {
  buildDeviceDaemonEndpoint,
  daemonClient,
  getDefaultDaemonEndpoint,
  normalizeDaemonSettings,
  type DaemonSettings,
} from '../../utils/DaemonClient';
import { buildMetroUrls, normalizeComputerHost } from './devConnectUtils';
import { saveComputerHost } from './devConnectPreferences';
import type { DevConnectState } from './types';
import { DevConnectQrScanner } from './DevConnectQrScanner';

const CONNECTION_TIMEOUT_MS = 2000;
const METRO_PORT = '8081';

type SyncUiState = 'idle' | 'checking' | 'connected' | 'retrying' | 'failed' | 'running';

export function DevConnectTab({ snapshot }: DebugFeatureRenderProps<DevConnectState>) {
  const inputRef = useRef<TextInput>(null);
  const [computerHost, setComputerHost] = useState(snapshot.computerHost);
  const [streaming, setStreaming] = useState(snapshot.streaming);
  const [syncState, setSyncState] = useState<SyncUiState>(snapshot.streaming ? 'running' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  const isSim = snapshot.isSimulator;

  useEffect(() => {
    setComputerHost(snapshot.computerHost);
    setStreaming(snapshot.streaming);
    setSyncState(snapshot.streaming ? 'running' : 'idle');
  }, [snapshot.computerHost, snapshot.streaming]);

  const metroUrls = useMemo(
    () => isSim
      ? { expUrl: `exp://localhost:${METRO_PORT}`, httpUrl: `http://localhost:${METRO_PORT}` }
      : buildMetroUrls(computerHost),
    [isSim, computerHost],
  );

  const handleHostChange = useCallback((value: string) => {
    setComputerHost(value);
    const normalized = normalizeComputerHost(value);
    if (normalized) {
      saveComputerHost(normalized).catch(() => {});
    }
    setSyncState((prev) => (prev === 'failed' ? 'idle' : prev));
    setMessage(null);
  }, []);

  const handleQrHost = useCallback((host: string) => {
    setComputerHost(host);
    saveComputerHost(host).catch(() => {});
    setMessage('Computer IP updated from QR code.');
  }, []);

  const validateSettings = useCallback((): boolean => {
    if (!isSim && !normalizeComputerHost(computerHost)) {
      setMessage('Enter your computer IP first.');
      return false;
    }
    return true;
  }, [computerHost, isSim]);

  const configureDaemon = useCallback(() => {
    const normalizedHost = isSim ? '' : (normalizeComputerHost(computerHost) ?? '');
    const settings: DaemonSettings = {
      mode: isSim ? 'simulator' : 'device',
      endpoint: '',
      deviceHost: normalizedHost,
      token: '',
    };
    daemonClient.configure(settings);
    const normalized = normalizeDaemonSettings(settings);
    const endpoint = normalized.endpoint || (isSim ? getDefaultDaemonEndpoint() : buildDeviceDaemonEndpoint(normalizedHost));
    return { ...normalized, endpoint };
  }, [computerHost, isSim]);

  const toggleLiveSync = useCallback(async () => {
    if (streaming) {
      daemonClient.disconnect();
      daemonClient.setStreamingEnabled(false);
      setStreaming(false);
      setSyncState('idle');
      setMessage(null);
      return;
    }

    if (!validateSettings()) return;

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
  }, [configureDaemon, streaming, validateSettings]);

  const sendOnce = useCallback(async () => {
    if (!validateSettings()) return;

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
  }, [configureDaemon, validateSettings]);

  const messageTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const copyUrl = useCallback((label: string, url: string) => {
    copyToComputer(url, { label });
    setMessage('Copied to computer output.');
    clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => setMessage(null), 1500);
  }, []);

  useEffect(() => () => clearTimeout(messageTimerRef.current), []);

  const canConnect = isSim || Boolean(normalizeComputerHost(computerHost));
  const busy = sending || syncState === 'checking';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {isSim ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Simulator — using localhost</Text>
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
                placeholder="192.168.1.10"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                onSubmitEditing={() => inputRef.current?.blur()}
                editable={!streaming}
              />
              {snapshot.qrAvailable ? (
                <TouchableOpacity style={styles.scanButton} onPress={() => setQrVisible(true)} disabled={streaming} activeOpacity={0.7}>
                  <Text style={styles.scanButtonText}>Scan</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remote JS Bundle</Text>
          <Text style={styles.sectionDesc}>
            Load JavaScript from your computer instead of the bundled file. Requires app restart.
          </Text>

          {!metroUrls ? (
            <View style={styles.stepCard}>
              <Text style={styles.stepHint}>Enter your computer IP above to get started.</Text>
            </View>
          ) : (
            <>
              <View style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepNumber}>1</Text>
                  <Text style={styles.stepTitle}>Copy bundle URL</Text>
                </View>
                <Text style={styles.stepDesc}>Use this URL as your remote JS bundle location:</Text>
                <View style={styles.urlRow}>
                  <Text style={styles.urlText} numberOfLines={1}>{metroUrls.httpUrl}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={() => copyUrl('Metro URL', metroUrls.httpUrl)} activeOpacity={0.7}>
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.urlRow}>
                  <Text style={styles.urlLabel}>Expo</Text>
                  <Text style={styles.urlText} numberOfLines={1}>{metroUrls.expUrl}</Text>
                  <TouchableOpacity style={styles.copyButton} onPress={() => copyUrl('Expo URL', metroUrls.expUrl)} activeOpacity={0.7}>
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepNumber}>2</Text>
                  <Text style={styles.stepTitle}>Configure remote debugging</Text>
                </View>
                <Text style={styles.stepDesc}>
                  {isSim
                    ? 'Simulator uses localhost automatically. Enable remote debugging in Dev Menu.'
                    : 'In Dev Menu, set the bundle URL to the copied address.'}
                </Text>
              </View>

              <View style={styles.stepCard}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepNumber}>3</Text>
                  <Text style={styles.stepTitle}>Restart the app</Text>
                </View>
                <Text style={styles.stepDesc}>
                  Close and reopen the app to load from Metro. Make sure Metro is running on your computer.
                </Text>
              </View>
            </>
          )}
        </View>
      </ScrollView>
      <DevConnectQrScanner
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        onScanHost={handleQrHost}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: `${Colors.primary}15`,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    marginBottom: 14,
  },
  badgeText: { fontSize: 13, fontWeight: '500', color: Colors.primary },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  sectionDesc: { fontSize: 12, color: Colors.textSecondary, marginBottom: 10, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    fontFamily: 'Courier',
  },
  scanButton: {
    minWidth: 62,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  scanButtonText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 12 },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  message: { fontSize: 12, lineHeight: 17, color: Colors.textSecondary, marginBottom: 12 },
  hint: { fontSize: 12, color: Colors.textLight },
  stepCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  stepHint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
    marginRight: 8,
    overflow: 'hidden',
  },
  stepTitle: { fontSize: 13, fontWeight: '600', color: Colors.text },
  stepDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: 8 },
  urlLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    marginBottom: 8,
  },
  urlText: { flex: 1, fontSize: 13, fontFamily: 'Courier', color: Colors.text, paddingVertical: 6 },
  copyButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: Colors.primary },
  copyButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
