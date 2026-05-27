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
import { copyToComputer } from '../../utils/copyToComputer';
import {
  buildDeviceDaemonEndpoint,
  daemonClient,
  getDefaultDaemonEndpoint,
  normalizeDaemonSettings,
  type DaemonConnectionMode,
  type DaemonSettings,
} from '../../utils/DaemonClient';
import { buildMetroUrls, normalizeComputerHost } from './devConnectUtils';
import { saveComputerHost, saveConnectionMode } from './devConnectPreferences';
import type { DevConnectState } from './types';
import { DevConnectQrScanner } from './DevConnectQrScanner';

const CONNECTION_TIMEOUT_MS = 2000;

type SyncUiState = 'idle' | 'checking' | 'connected' | 'retrying' | 'failed' | 'running';

function formatConnectionFailure(): string {
  return 'Cannot reach desktop. Try /health in phone browser.';
}

export function DevConnectTab({ snapshot }: DebugFeatureRenderProps<DevConnectState>) {
  const inputRef = useRef<TextInput>(null);
  const [computerHost, setComputerHost] = useState(snapshot.computerHost);
  const [mode, setMode] = useState<DaemonConnectionMode>(snapshot.mode);
  const [streaming, setStreaming] = useState(snapshot.streaming);
  const [syncState, setSyncState] = useState<SyncUiState>(snapshot.streaming ? 'running' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  useEffect(() => {
    setComputerHost(snapshot.computerHost);
    setMode(snapshot.mode);
    setStreaming(snapshot.streaming);
    setSyncState(snapshot.streaming ? 'running' : 'idle');
  }, [snapshot.computerHost, snapshot.mode, snapshot.streaming]);

  const metroUrls = buildMetroUrls(computerHost);

  const handleHostChange = useCallback((value: string) => {
    setComputerHost(value);
    const normalized = normalizeComputerHost(value);
    if (normalized) {
      saveComputerHost(normalized).catch(() => {});
    }
    setSyncState((prev) => (prev === 'failed' ? 'idle' : prev));
    setMessage(null);
  }, []);

  const handleModeChange = useCallback((nextMode: DaemonConnectionMode) => {
    setMode(nextMode);
    saveConnectionMode(nextMode).catch(() => {});
    setMessage(null);
  }, []);

  const handleQrHost = useCallback((host: string) => {
    setComputerHost(host);
    saveComputerHost(host).catch(() => {});
    setMessage('Computer IP updated from QR code.');
  }, []);

  const validateSettings = useCallback((): boolean => {
    if (mode === 'device' && !normalizeComputerHost(computerHost)) {
      setMessage('Enter your computer IP first.');
      return false;
    }
    return true;
  }, [computerHost, mode]);

  const configureDaemon = useCallback(() => {
    const normalizedHost = normalizeComputerHost(computerHost) ?? '';
    const settings: DaemonSettings = {
      mode,
      endpoint: '',
      deviceHost: normalizedHost,
      token: '',
    };
    daemonClient.configure(settings);
    return normalizeDaemonSettings(settings);
  }, [computerHost, mode]);

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
      setMessage(formatConnectionFailure());
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
        setMessage(formatConnectionFailure());
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

  const copyUrl = useCallback((label: string, url: string) => {
    copyToComputer(url, { label });
    setMessage('Copied to computer output.');
    setTimeout(() => setMessage(null), 1500);
  }, []);

  const daemonTarget = mode === 'device'
    ? buildDeviceDaemonEndpoint(computerHost) || 'Enter computer IP'
    : getDefaultDaemonEndpoint();
  const canConnect = mode === 'simulator' || Boolean(normalizeComputerHost(computerHost));
  const busy = sending || syncState === 'checking';
  let statusTitle = 'Ready';
  if (sending) statusTitle = 'Sending';
  else if (syncState === 'checking') statusTitle = 'Checking';
  else if (streaming && syncState === 'retrying') statusTitle = 'Retrying desktop sync';
  else if (syncState === 'failed') statusTitle = 'Failed';
  else if (streaming) statusTitle = 'Live sync running';
  else if (mode === 'device' && !normalizeComputerHost(computerHost)) statusTitle = 'Enter computer IP';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desktop Sync</Text>
          <View style={styles.statusCard}>
            <View style={[styles.statusDot, streaming ? styles.dotActive : styles.dotInactive]} />
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>{statusTitle}</Text>
              <Text style={styles.statusTarget} numberOfLines={1}>{daemonTarget}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Connection</Text>
          <View style={styles.segment}>
            <TouchableOpacity style={[styles.segmentButton, mode === 'simulator' && styles.segmentButtonActive]} onPress={() => handleModeChange('simulator')} disabled={streaming} activeOpacity={0.7}>
              <Text style={[styles.segmentText, mode === 'simulator' && styles.segmentTextActive]}>Simulator</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentButton, mode === 'device' && styles.segmentButtonActive]} onPress={() => handleModeChange('device')} disabled={streaming} activeOpacity={0.7}>
              <Text style={[styles.segmentText, mode === 'device' && styles.segmentTextActive]}>Real device</Text>
            </TouchableOpacity>
          </View>
        </View>

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

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.primaryButton, (!canConnect || busy) && styles.buttonDisabled]} onPress={toggleLiveSync} disabled={!canConnect || busy} activeOpacity={0.75}>
            <Text style={styles.primaryButtonText}>{streaming ? 'Stop Live Sync' : busy ? 'Checking...' : 'Start Live Sync'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, (!canConnect || busy) && styles.buttonDisabled]} onPress={sendOnce} disabled={!canConnect || busy} activeOpacity={0.75}>
            <Text style={styles.secondaryButtonText}>{sending ? 'Sending...' : 'Send Once'}</Text>
          </TouchableOpacity>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Metro Bundler</Text>
          {metroUrls ? (
            <>
              <View style={styles.urlRow}>
                <Text style={styles.urlText} numberOfLines={1}>{metroUrls.expUrl}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={() => copyUrl('Metro exp URL', metroUrls.expUrl)} activeOpacity={0.7}>
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.urlRow}>
                <Text style={styles.urlText} numberOfLines={1}>{metroUrls.httpUrl}</Text>
                <TouchableOpacity style={styles.copyButton} onPress={() => copyUrl('Metro HTTP URL', metroUrls.httpUrl)} activeOpacity={0.7}>
                  <Text style={styles.copyButtonText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.hint}>Enter a computer IP to show Metro URLs.</Text>
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
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary, marginBottom: 6 },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { backgroundColor: Colors.success },
  dotInactive: { backgroundColor: Colors.textLight },
  statusCopy: { flex: 1 },
  statusTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  statusTarget: { marginTop: 2, fontSize: 12, color: Colors.textLight, fontFamily: 'Courier' },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 7 },
  segmentButtonActive: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.primary },
  segmentText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  segmentTextActive: { color: Colors.primary, fontWeight: '600' },
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 12 },
  primaryButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.primary },
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
  hint: { fontSize: 12, color: Colors.textLight },
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
