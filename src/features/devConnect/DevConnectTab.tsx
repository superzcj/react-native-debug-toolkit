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
import {
  buildDeviceDaemonEndpoint,
  daemonClient,
  getDefaultDaemonEndpoint,
  normalizeDaemonSettings,
  type DaemonSettings,
} from '../../utils/DaemonClient';
import {
  DEFAULT_DAEMON_PORT,
  DEFAULT_METRO_PORT,
  buildDaemonDeviceHost,
  buildMetroTarget,
  buildMetroUrls,
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
} from './devConnectUtils';
import {
  saveComputerHost,
  saveComputerTarget,
  saveDaemonPort,
  saveMetroPort,
} from './devConnectPreferences';
import {
  applyMetroBundle,
  getNativeDiagnostics,
  resetMetroBundle,
  type NativeDiagnostics,
} from './nativeDevConnect';
import type { DevConnectFeatureControls, DevConnectSettingsPatch, DevConnectState } from './types';

const CONNECTION_TIMEOUT_MS = 2000;

type SyncUiState = 'idle' | 'checking' | 'connected' | 'retrying' | 'failed' | 'running';

function getSimulatorMetroHost(): string {
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

function describeMetroFailure(result: { reason: string; error?: string }): string {
  if (result.reason === 'native_unavailable') {
    return 'Native DevConnect not installed. Rebuild app after installing native module.';
  }
  if (result.reason === 'metro_unreachable') {
    return result.error ? `Metro not reachable: ${result.error}` : 'Metro not reachable. Start Metro on that port.';
  }
  if (result.reason === 'fetch_unavailable') {
    return 'Cannot check Metro because fetch is unavailable.';
  }
  if (result.reason === 'invalid_target') {
    return 'Enter a valid computer IP and Metro port.';
  }
  return result.error ? `Metro switch failed: ${result.error}` : 'Metro switch failed.';
}

export function DevConnectTab({ snapshot, feature }: DebugFeatureRenderProps<DevConnectState>) {
  const inputRef = useRef<TextInput>(null);
  const [computerHost, setComputerHost] = useState(snapshot.computerHost);
  const [metroPort, setMetroPort] = useState(snapshot.metroPort);
  const [daemonPort, setDaemonPort] = useState(snapshot.daemonPort);
  const [streaming, setStreaming] = useState(snapshot.streaming);
  const [syncState, setSyncState] = useState<SyncUiState>(snapshot.streaming ? 'running' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [metroBusy, setMetroBusy] = useState(false);
  const [diagData, setDiagData] = useState<NativeDiagnostics | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);

  const isSim = snapshot.isSimulator;

  const updateFeatureSettings = useCallback((patch: DevConnectSettingsPatch) => {
    (feature as unknown as DevConnectFeatureControls).updateSettings?.(patch);
  }, [feature]);

  useEffect(() => {
    getNativeDiagnostics().then((result) => {
      if (result) {
        setDiagData(result);
        console.info(
          `[DevConnect] debugBuild=${result.isDebugBuild} appDelegate=${result.appDelegateClass} persistedHost=${result.persistedMetroHost ?? 'none'}`,
        );
      }
    }).catch(() => {});
  }, []);

  const refreshDiag = useCallback(() => {
    getNativeDiagnostics().then((result) => {
      if (result) setDiagData(result);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setComputerHost(snapshot.computerHost);
  }, [snapshot.computerHost]);

  useEffect(() => {
    setMetroPort(snapshot.metroPort);
  }, [snapshot.metroPort]);

  useEffect(() => {
    setDaemonPort(snapshot.daemonPort);
  }, [snapshot.daemonPort]);

  useEffect(() => {
    setStreaming(snapshot.streaming);
    setSyncState(snapshot.streaming ? 'running' : 'idle');
  }, [snapshot.streaming]);

  const metroHost = isSim ? getSimulatorMetroHost() : computerHost;
  const metroTarget = useMemo(
    () => buildMetroTarget(metroHost, metroPort),
    [metroHost, metroPort],
  );
  const metroUrls = useMemo(
    () => buildMetroUrls(metroHost, metroPort),
    [metroHost, metroPort],
  );

  const handleHostChange = useCallback((value: string) => {
    setComputerHost(value);
    const target = parseComputerTarget(value);
    if (target) {
      setMetroPort(target.metroPort);
      saveComputerTarget(value)
        .then((savedTarget) => {
          if (savedTarget) {
            updateFeatureSettings({
              computerHost: savedTarget.computerHost,
              metroPort: savedTarget.metroPort,
            });
          }
        })
        .catch(() => {});
    }
    setSyncState((prev) => (prev === 'failed' ? 'idle' : prev));
    setMessage(null);
  }, [updateFeatureSettings]);

  const handleMetroPortChange = useCallback((value: string) => {
    setMetroPort(value);
    const normalized = normalizePort(value);
    if (normalized) {
      saveMetroPort(normalized)
        .then(() => updateFeatureSettings({ metroPort: normalized }))
        .catch(() => {});
    }
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

    const normalizedMetroPort = normalizePort(metroPort);
    if (normalizedMetroPort) {
      patch.metroPort = normalizedMetroPort;
      writes.push(saveMetroPort(normalizedMetroPort));
      setMetroPort(normalizedMetroPort);
    }

    await Promise.all(writes);
    updateFeatureSettings(patch);
    return true;
  }, [computerHost, daemonPort, isSim, metroPort, updateFeatureSettings]);

  const persistMetroSettings = useCallback(async (): Promise<boolean> => {
    if (!metroTarget) {
      setMessage('Enter a valid computer IP and Metro port.');
      return false;
    }

    const patch: DevConnectSettingsPatch = { metroPort: metroTarget.port };
    const writes: Array<Promise<unknown>> = [saveMetroPort(metroTarget.port)];
    setMetroPort(metroTarget.port);

    if (!isSim) {
      patch.computerHost = metroTarget.host;
      writes.push(saveComputerTarget(metroTarget.hostPort));
      setComputerHost(metroTarget.host);
    }

    await Promise.all(writes);
    updateFeatureSettings(patch);
    return true;
  }, [isSim, metroTarget, updateFeatureSettings]);

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

  const applyRemoteBundle = useCallback(async () => {
    if (!metroTarget) {
      setMessage('Enter a valid computer IP and Metro port.');
      return;
    }
    if (!snapshot.nativeMetroAvailable) {
      setMessage(describeMetroFailure({ reason: 'native_unavailable' }));
      return;
    }

    setMetroBusy(true);
    setMessage('Checking Metro...');
    try {
      if (!(await persistMetroSettings())) {
        return;
      }
      const result = await applyMetroBundle(metroTarget.host, metroTarget.port);
      if (result.ok) {
        setMessage(`Using Metro at ${result.hostPort}. Reloading...`);
      } else {
        setMessage(describeMetroFailure(result));
      }
    } finally {
      setMetroBusy(false);
    }
  }, [metroTarget, persistMetroSettings, snapshot.nativeMetroAvailable]);

  const resetRemoteBundle = useCallback(async () => {
    if (!snapshot.nativeMetroAvailable) {
      setMessage(describeMetroFailure({ reason: 'native_unavailable' }));
      return;
    }

    setMetroBusy(true);
    try {
      const result = await resetMetroBundle();
      if (result.ok) {
        setMessage('Metro host reset. Reloading...');
      } else {
        setMessage(describeMetroFailure(result));
      }
    } finally {
      setMetroBusy(false);
    }
  }, [snapshot.nativeMetroAvailable]);

  // Metro host switching only works in Debug builds. diagData is iOS-populated; when we know
  // it's a Release build, disable the controls (Android reports null → stays enabled).
  const metroReleaseBlocked = diagData ? !diagData.isDebugBuild : false;
  const canConnect = isSim || (Boolean(normalizeComputerHost(computerHost)) && Boolean(normalizePort(daemonPort)));
  const canUseMetro = Boolean(metroTarget) && snapshot.nativeMetroAvailable && !metroBusy && !metroReleaseBlocked;
  const busy = sending || syncState === 'checking';
  const subnetPrefix = snapshot.subnetPrefix;
  const ipPlaceholder = subnetPrefix ? `${subnetPrefix}...` : '192.168.1.10';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {isSim ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Simulator/emulator - using {getSimulatorMetroHost()}</Text>
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
                placeholderTextColor={Colors.textLight}
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
          <Text style={styles.label}>Ports</Text>
          <View style={styles.portRow}>
            <View style={styles.portField}>
              <Text style={styles.portLabel}>Metro</Text>
              <TextInput
                style={styles.portInput}
                value={metroPort}
                onChangeText={handleMetroPortChange}
                placeholder={DEFAULT_METRO_PORT}
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
            <View style={styles.portField}>
              <Text style={styles.portLabel}>Logs</Text>
              <TextInput
                style={styles.portInput}
                value={daemonPort}
                onChangeText={handleDaemonPortChange}
                placeholder={DEFAULT_DAEMON_PORT}
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                returnKeyType="done"
              />
            </View>
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

        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Remote JS Bundle</Text>
            {diagData ? (
              <View style={styles.swizzleBadge}>
                <View style={[styles.swizzleDot, diagData.isDebugBuild ? styles.dotGreen : styles.dotRed]} />
                <Text style={styles.swizzleBadgeText}>
                  {diagData.isDebugBuild ? 'debug build' : 'release: disabled'}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.sectionDesc}>
            Starts from the embedded bundle. After you apply a computer IP, hot-reloads from that
            Metro. Debug builds only — use Reset to go back to the embedded bundle.
          </Text>

          {!metroUrls ? (
            <View style={styles.stepCard}>
              <Text style={styles.stepHint}>Enter your computer IP and Metro port to get started.</Text>
            </View>
          ) : (
            <View style={styles.stepCard}>
              <View style={styles.urlRow}>
                <Text style={styles.urlLabel}>HTTP</Text>
                <Text style={styles.urlText} numberOfLines={1}>{metroUrls.httpUrl}</Text>
              </View>
              <View style={styles.urlRow}>
                <Text style={styles.urlLabel}>Expo</Text>
                <Text style={styles.urlText} numberOfLines={1}>{metroUrls.expUrl}</Text>
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryButton, !canUseMetro && styles.buttonDisabled]}
              onPress={applyRemoteBundle}
              disabled={!canUseMetro}
              activeOpacity={0.75}
            >
              <Text style={styles.primaryButtonText}>
                {metroBusy ? 'Checking...' : 'Use Metro Bundle'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, (!snapshot.nativeMetroAvailable || metroBusy) && styles.buttonDisabled]}
              onPress={resetRemoteBundle}
              disabled={!snapshot.nativeMetroAvailable || metroBusy}
              activeOpacity={0.75}
            >
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {!snapshot.nativeMetroAvailable ? (
            <Text style={styles.hint}>Native DevConnect requires pod install / Gradle sync and app rebuild.</Text>
          ) : null}

          {metroReleaseBlocked ? (
            <Text style={styles.diagWarning}>
              ⚠ This is a Release build. Metro host switching is disabled — RN loads the embedded
              bundle and strips the packager machinery in Release. Run a Debug build to switch hosts.
            </Text>
          ) : null}
        </View>

        {snapshot.nativeMetroAvailable && diagData ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.diagHeader}
              onPress={() => { setDiagOpen((v) => !v); refreshDiag(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionTitle}>iOS Bundle Status</Text>
              <Text style={styles.diagChevron}>{diagOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {diagOpen ? (
              <View style={styles.diagCard}>
                <View style={styles.diagRow}>
                  <Text style={styles.diagKey}>AppDelegate</Text>
                  <Text style={styles.diagVal}>{diagData.appDelegateClass}</Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagKey}>packagerHost</Text>
                  <Text style={styles.diagVal}>{diagData.persistedMetroHost ?? '—'}</Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagKey}>embedded</Text>
                  <Text style={[styles.diagVal, diagData.hasEmbeddedBundle ? styles.diagGood : styles.diagWarn]}>
                    {diagData.hasEmbeddedBundle ? 'main.jsbundle' : 'missing'}
                  </Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagKey}>build</Text>
                  <Text style={[styles.diagVal, diagData.isDebugBuild ? styles.diagGood : styles.diagWarn]}>
                    {diagData.isDebugBuild ? 'Debug' : 'Release'}
                  </Text>
                </View>
                <View style={styles.diagRow}>
                  <Text style={styles.diagKey}>embedded-first</Text>
                  <Text style={[styles.diagVal, diagData.embeddedFirstHookInstalled ? styles.diagGood : styles.diagWarn]}>
                    {diagData.embeddedFirstHookInstalled ? 'active' : 'inactive'}
                  </Text>
                </View>
                {!diagData.embeddedFirstHookInstalled ? (
                  <Text style={styles.diagWarning}>
                    ⚠ Embedded-first hook not active (bundleRoot=
                    {diagData.bundleRootHookInstalled ? 'Y' : 'N'}). Rebuild after pod install.
                    Without it, Debug may still try Metro on launch.
                  </Text>
                ) : diagData.hasEmbeddedBundle === false ? (
                  <Text style={styles.diagWarning}>
                    ⚠ main.jsbundle is missing from the app package. Build with an embedded bundle
                    (e.g. export/bundle) or cold start cannot use offline JS.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
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
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  subnetHint: { marginTop: 6 },
  subnetHintText: { fontSize: 12, color: Colors.primary, fontWeight: '500' },
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
  portRow: { flexDirection: 'row', gap: 10 },
  portField: { flex: 1 },
  portLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  portInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: Colors.text,
    fontFamily: 'Courier',
  },
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
  hint: { fontSize: 12, color: Colors.textLight, lineHeight: 17 },
  stepCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  stepHint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  urlLabel: {
    minWidth: 40,
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    textAlign: 'center',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingVertical: 7,
  },
  urlText: { flex: 1, fontSize: 13, fontFamily: 'Courier', color: Colors.text },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  swizzleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  swizzleDot: { width: 6, height: 6, borderRadius: 3 },
  dotGreen: { backgroundColor: '#34C759' },
  dotRed: { backgroundColor: '#FF3B30' },
  swizzleBadgeText: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'Courier' },
  diagHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  diagChevron: { fontSize: 12, color: Colors.textSecondary },
  diagCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 10,
  },
  diagRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  diagKey: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Courier' },
  diagVal: { fontSize: 12, color: Colors.text, fontFamily: 'Courier', fontWeight: '600' },
  diagGood: { color: '#34C759' },
  diagWarn: { color: '#FF9500' },
  diagWarning: {
    marginTop: 10,
    fontSize: 11,
    color: '#FF9500',
    lineHeight: 16,
  },
});
