import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Colors } from '../theme/colors';
import {
  daemonClient,
  type DaemonConnectionMode,
  type DaemonSettings,
  buildDeviceDaemonEndpoint,
  normalizeDaemonSettings,
  getDefaultDaemonEndpoint,
} from '../../utils/DaemonClient';

interface StreamingSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

type SyncUiState = 'idle' | 'connecting' | 'connected' | 'retrying' | 'failed' | 'running';

const CONNECTION_TIMEOUT_MS = 2000;

function formatConnectionFailure(): string {
  return 'Cannot reach desktop. Try /health in phone browser.';
}

export function StreamingSettingsModal({ visible, onClose }: StreamingSettingsModalProps) {
  const inputRef = useRef<TextInput>(null);
  const [mode, setMode] = useState<DaemonConnectionMode>('simulator');
  const [deviceHost, setDeviceHost] = useState('');
  const [streaming, setStreaming] = useState(daemonClient.isConnected());
  const [syncState, setSyncState] = useState<SyncUiState>(daemonClient.isConnected() ? 'running' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleDeviceHostChange = useCallback((value: string) => {
    setDeviceHost(value);
    if (syncState === 'failed') {
      setSyncState('idle');
    }
    setMessage(null);
  }, [syncState]);

  const detectDeviceHost = useCallback(async () => {
    setMessage('Enter your Mac IP, or open /health on the phone browser to verify reachability.');
  }, []);

  useEffect(() => {
    if (visible) {
      const settings = daemonClient.getSettings();
      setMode(settings.mode);
      setDeviceHost(settings.deviceHost);
    }
  }, [visible]);

  useEffect(() => {
    const active = daemonClient.isConnected();
    setStreaming(active);
    setSyncState(active ? 'running' : 'idle');
  }, [visible]);

  const getSettings = useCallback((): DaemonSettings => ({
    mode,
    endpoint: '',
    deviceHost,
    token: '',
  }), [deviceHost, mode]);

  const validateSettings = useCallback((): boolean => {
    if (mode === 'device' && !deviceHost.trim()) {
      setMessage('Enter your Mac IP first.');
      return false;
    }
    return true;
  }, [deviceHost, mode]);

  const handleModeChange = useCallback((nextMode: DaemonConnectionMode) => {
    setMode(nextMode);
  }, []);

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

    const settings = getSettings();
    const daemonOptions = normalizeDaemonSettings(settings);
    setMessage('Checking desktop connection...');
    setSyncState('connecting');
    daemonClient.configure(settings);

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
          setSyncState('connected');
          setMessage(null);
        } else if (status.state === 'retrying') {
          setSyncState('retrying');
          setMessage('Desktop not reachable. Retrying...');
        } else if (status.state === 'failed') {
          setStreaming(false);
          setSyncState('failed');
          setMessage(
            status.reason === 'auth'
              ? 'Desktop token rejected.'
              : 'Desktop not reachable after multiple retries.',
          );
        } else {
          setSyncState('connecting');
        }
      },
    });
    setStreaming(true);
  }, [getSettings, streaming, validateSettings]);

  const sendOnce = useCallback(async () => {
    if (!validateSettings()) {
      return;
    }

    const settings = getSettings();
    const daemonOptions = normalizeDaemonSettings(settings);
    setSending(true);
    setMessage('Checking desktop connection...');
    daemonClient.configure(settings);

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
  }, [getSettings, validateSettings]);

  const target = mode === 'device'
    ? buildDeviceDaemonEndpoint(deviceHost) || 'Enter Mac IP'
    : getDefaultDaemonEndpoint();
  const canConnect = mode === 'simulator' || Boolean(deviceHost.trim());
  const connecting = !streaming && syncState === 'connecting';
  const busy = sending || connecting;
  const statusTitle = sending
    ? 'Checking'
    : connecting
        ? 'Checking'
        : streaming && syncState === 'connected'
      ? 'Live sync connected'
        : streaming && syncState === 'retrying'
          ? 'Retrying desktop sync'
          : syncState === 'failed'
            ? 'Failed'
            : streaming
              ? 'Live sync running'
              : mode === 'device' && !deviceHost.trim()
                ? 'Enter Mac IP'
                : 'Ready';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={styles.title}>Desktop Logs</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.statusCard}>
                <View style={[styles.statusDot, streaming ? styles.dotActive : styles.dotInactive]} />
                <View style={styles.statusCopy}>
                  <Text style={styles.statusTitle}>{statusTitle}</Text>
                  <Text style={styles.statusTarget} numberOfLines={1}>{target}</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Connection</Text>
                <View style={styles.segment}>
                  <TouchableOpacity
                    style={[styles.segmentButton, mode === 'simulator' && styles.segmentButtonActive]}
                    onPress={() => handleModeChange('simulator')}
                    disabled={streaming}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.segmentText, mode === 'simulator' && styles.segmentTextActive]}>
                      Simulator
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentButton, mode === 'device' && styles.segmentButtonActive]}
                    onPress={() => handleModeChange('device')}
                    disabled={streaming}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.segmentText, mode === 'device' && styles.segmentTextActive]}>
                      Real device
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {mode === 'device' ? (
                <View style={styles.section}>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputLabel}>Mac IP</Text>
                    <TextInput
                      ref={inputRef}
                      style={styles.input}
                      value={deviceHost}
                      onChangeText={handleDeviceHostChange}
                      placeholder="192.168.1.10"
                      placeholderTextColor={Colors.textLight}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      returnKeyType="done"
                      onSubmitEditing={() => inputRef.current?.blur()}
                      editable={!streaming}
                    />
                    <TouchableOpacity
                      style={[styles.detectButton, (streaming || busy) && styles.buttonDisabled]}
                      onPress={detectDeviceHost}
                      disabled={streaming || busy}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.detectButtonText}>?</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {message ? <Text style={styles.message}>{message}</Text> : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.primaryButton, (!canConnect || busy) && styles.buttonDisabled]}
                  onPress={toggleLiveSync}
                  disabled={!canConnect || busy}
                  activeOpacity={0.75}
                >
                  <Text style={styles.primaryButtonText}>
                    {streaming ? 'Stop Live Sync' : busy ? 'Checking...' : 'Start Live Sync'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryButton, (!canConnect || busy) && styles.buttonDisabled]}
                  onPress={sendOnce}
                  disabled={!canConnect || busy}
                  activeOpacity={0.75}
                >
                  <Text style={styles.secondaryButtonText}>{sending ? 'Sending...' : 'Send Once'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    maxHeight: '82%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textLight,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  closeButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  statusCopy: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  statusTarget: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: 'Courier',
  },
  section: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 7,
  },
  segmentButtonActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputLabel: {
    width: 50,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    fontFamily: 'Courier',
  },
  detectButton: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  detectButtonText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: Colors.success,
  },
  dotInactive: {
    backgroundColor: Colors.textLight,
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
