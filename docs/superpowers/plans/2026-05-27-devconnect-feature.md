# DevConnect Simplification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify existing DevConnect feature based on user feedback: (1) remove simulator/device mode selector and auto-detect, (2) simplify UI, (3) support both `expo-camera` and `react-native-camera-kit` for QR scanning.

**Context:** DevConnect feature is fully implemented and all 147 tests pass. This plan modifies existing code — no new features from scratch.

**Key design decisions:**
- Auto-detect simulator via `Platform.constants` (iOS: model contains "Simulator", Android: `isEmulator` or model contains "sdk" / "emulator"). Zero dependencies.
- On simulator: hide Computer IP input entirely, auto-use localhost endpoint. Show Metro URLs with localhost.
- On real device: show Computer IP input + optional Scan button. Show Metro URLs with entered IP.
- Remove `connectionMode` preference and `saveConnectionMode` — mode is now auto-detected, never persisted.
- Generalize `cameraKit.ts` → `qrCamera.ts`: try `react-native-camera-kit` then `expo-camera`.
- Simplify UI: remove segment control, remove status card complexity, leaner layout.

---

## Task 1: Add Simulator Auto-Detection

**Files:**
- Create: `src/features/devConnect/platformDetect.ts`
- Create: `src/__tests__/features/platformDetect.test.ts`

- [ ] **Step 1: Write tests**

Create `src/__tests__/features/platformDetect.test.ts`:

```typescript
import { isSimulator } from '../../features/devConnect/platformDetect';

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  constants: {
    model: 'iPhone Simulator',
  },
}));

describe('platformDetect', () => {
  it('detects iOS simulator from model name', () => {
    expect(isSimulator()).toBe(true);
  });

  it('detects Android emulator from isEmulator flag', () => {
    jest.resetModules();
    jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
      OS: 'android',
      constants: { isEmulator: true },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isSimulator: detect } = require('../../features/devConnect/platformDetect');
    expect(detect()).toBe(true);
  });

  it('returns false for real device', () => {
    jest.resetModules();
    jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
      OS: 'ios',
      constants: { model: 'iPhone 16 Pro' },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isSimulator: detect } = require('../../features/devConnect/platformDetect');
    expect(detect()).toBe(false);
  });

  it('returns false for unknown platform constants', () => {
    jest.resetModules();
    jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
      OS: 'web',
      constants: {},
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isSimulator: detect } = require('../../features/devConnect/platformDetect');
    expect(detect()).toBe(false);
  });
});
```

- [ ] **Step 2: Implement detection**

Create `src/features/devConnect/platformDetect.ts`:

```typescript
import { Platform } from 'react-native';

export function isSimulator(): boolean {
  const { OS, constants } = Platform;

  if (OS === 'android') {
    if (constants.isEmulator === true) return true;
    const model = String(constants.model ?? '').toLowerCase();
    return model.includes('sdk') || model.includes('emulator');
  }

  if (OS === 'ios') {
    const model = String(constants.model ?? '');
    return model.toLowerCase().includes('simulator');
  }

  return false;
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --runInBand src/__tests__/features/platformDetect.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/features/devConnect/platformDetect.ts src/__tests__/features/platformDetect.test.ts
git commit -m "feat: auto-detect simulator for DevConnect"
```

---

## Task 2: Remove Mode Preference and Wire Auto-Detection

**Files:**
- Modify: `src/features/devConnect/devConnectPreferences.ts`
- Modify: `src/__tests__/features/devConnectPreferences.test.ts`
- Modify: `src/features/devConnect/types.ts`
- Modify: `src/features/devConnect/index.ts`
- Modify: `src/utils/debugPreferences.ts` (remove `connectionMode` key)

This task removes `connectionMode` from preferences and uses `isSimulator()` instead. The `restoreDevConnectSettingsToDaemon` function reads `isSimulator()` at runtime.

- [ ] **Step 1: Update DevConnectState — remove mode, add isSimulator**

Modify `src/features/devConnect/types.ts`:

```typescript
export interface DevConnectState {
  isSimulator: boolean;
  computerHost: string;
  qrAvailable: boolean;
  streaming: boolean;
}
```

- [ ] **Step 2: Simplify preferences — remove mode persistence**

Modify `src/features/devConnect/devConnectPreferences.ts`:

```typescript
import { daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import { normalizeComputerHost } from './devConnectUtils';
import { isSimulator } from './platformDetect';

export interface DevConnectPreferences {
  computerHost: string;
}

export async function loadDevConnectPreferences(): Promise<DevConnectPreferences> {
  const storedHost = await getPreference(KEYS.computerHost);
  return {
    computerHost: storedHost ? normalizeComputerHost(storedHost) ?? '' : '',
  };
}

export async function saveComputerHost(value: string): Promise<string | null> {
  const normalized = normalizeComputerHost(value);
  if (!normalized) return null;
  await setPreference(KEYS.computerHost, normalized);
  return normalized;
}

export async function restoreDevConnectSettingsToDaemon(): Promise<void> {
  const preferences = await loadDevConnectPreferences();
  const mode = isSimulator() ? 'simulator' as const : 'device' as const;
  daemonClient.configure({
    mode,
    endpoint: '',
    deviceHost: preferences.computerHost,
    token: '',
  });
}
```

- [ ] **Step 3: Remove connectionMode from debugPreferences KEYS**

Modify `src/utils/debugPreferences.ts` — remove `connectionMode` line from KEYS:

```typescript
export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  consoleLogs: '@react_native_debug_toolkit/console_logs',
  networkLogs: '@react_native_debug_toolkit/network_logs',
  trackLogs: '@react_native_debug_toolkit/track_logs',
  computerHost: '@react_native_debug_toolkit/computer_host',
} as const;
```

- [ ] **Step 4: Update preferences tests**

Replace `src/__tests__/features/devConnectPreferences.test.ts`:

```typescript
import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
} from '../../features/devConnect/devConnectPreferences';

jest.mock('../../features/devConnect/platformDetect', () => ({
  isSimulator: jest.fn().mockReturnValue(false),
}));

import { isSimulator } from '../../features/devConnect/platformDetect';
const mockedIsSimulator = isSimulator as jest.MockedFunction<typeof isSimulator>;

describe('devConnectPreferences', () => {
  beforeEach(async () => {
    _resetDaemonClientForTesting();
    await setPreference(KEYS.computerHost, '');
    mockedIsSimulator.mockReturnValue(false);
  });

  it('saves normalized computer host only', async () => {
    const host = await saveComputerHost('exp://192.168.1.10:8081');

    expect(host).toBe('192.168.1.10');
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
  });

  it('does not overwrite stored host when input is invalid', async () => {
    await saveComputerHost('192.168.1.10');
    const host = await saveComputerHost('999.1.1.1');

    expect(host).toBeNull();
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
  });

  it('configures daemon as simulator when platform is simulator', async () => {
    mockedIsSimulator.mockReturnValue(true);

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'simulator',
      endpoint: '',
    });
  });

  it('configures daemon as device with stored host', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');
    mockedIsSimulator.mockReturnValue(false);

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
    });
  });
});
```

- [ ] **Step 5: Update feature factory**

Modify `src/features/devConnect/index.ts` — remove `saveConnectionMode` export, update state shape:

```typescript
import { DevConnectTab } from './DevConnectTab';
import { isCameraKitAvailable } from './cameraKit';
import { loadDevConnectPreferences } from './devConnectPreferences';
import { isSimulator } from './platformDetect';
import { daemonClient } from '../../utils/DaemonClient';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { DevConnectState } from './types';

export type { DevConnectState } from './types';
export {
  buildMetroUrls,
  normalizeComputerHost,
  parseMetroQrPayload,
} from './devConnectUtils';
export {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
} from './devConnectPreferences';

export const createDevConnectFeature = (): DebugFeature<DevConnectState> => {
  const listeners = new Set<DebugFeatureListener>();
  let state: DevConnectState = {
    isSimulator: isSimulator(),
    computerHost: '',
    qrAvailable: isCameraKitAvailable(),
    streaming: daemonClient.isConnected(),
  };

  const notify = () => {
    state = {
      ...state,
      streaming: daemonClient.isConnected(),
    };
    listeners.forEach((listener) => listener());
  };

  return {
    name: 'devConnect',
    label: 'DevConnect',
    renderContent: DevConnectTab,
    setup() {
      loadDevConnectPreferences().then((preferences) => {
        state = {
          ...state,
          computerHost: preferences.computerHost,
        };
        notify();
      }).catch(() => {
        notify();
      });
    },
    getSnapshot: () => state,
    cleanup() {
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
```

- [ ] **Step 6: Run tests**

```bash
npm test -- --runInBand src/__tests__/features/devConnectPreferences.test.ts src/__tests__/features/platformDetect.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/features/devConnect/devConnectPreferences.ts src/features/devConnect/types.ts src/features/devConnect/index.ts src/utils/debugPreferences.ts src/__tests__/features/devConnectPreferences.test.ts
git commit -m "refactor: auto-detect simulator, remove mode preference"
```

---

## Task 3: Simplify DevConnect Tab UI

**Files:**
- Modify: `src/features/devConnect/DevConnectTab.tsx`

Key UI changes:
- Remove simulator/device segment control entirely.
- On simulator: hide Computer IP section, show "Simulator detected" badge, auto-use localhost.
- On real device: show Computer IP input with optional Scan button.
- Remove status card — replace with simpler inline status text next to the sync buttons.
- Keep: Metro URLs section, sync buttons, QR scanner.

- [ ] **Step 1: Rewrite DevConnectTab.tsx**

Replace `src/features/devConnect/DevConnectTab.tsx`:

```typescript
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

  const metroHost = isSim ? 'localhost' : computerHost;
  const metroUrls = isSim
    ? { expUrl: `exp://localhost:${METRO_PORT}`, httpUrl: `http://localhost:${METRO_PORT}` }
    : buildMetroUrls(computerHost);

  const handleHostChange = useCallback((value: string) => {
    setComputerHost(value);
    const normalized = normalizeComputerHost(value);
    if (normalized) {
      saveComputerHost(normalized).catch(() => {});
    }
    if (syncState === 'failed') setSyncState('idle');
    setMessage(null);
  }, [syncState]);

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

  const configureDaemon = useCallback((): ReturnType<typeof normalizeDaemonSettings> & { endpoint: string } => {
    const normalizedHost = isSim ? '' : (normalizeComputerHost(computerHost) ?? '');
    const settings: DaemonSettings = {
      mode: isSim ? 'simulator' : 'device',
      endpoint: '',
      deviceHost: normalizedHost,
      token: '',
    };
    daemonClient.configure(settings);
    return { ...normalizeDaemonSettings(settings), endpoint: normalizeDaemonSettings(settings).endpoint || (isSim ? getDefaultDaemonEndpoint() : buildDeviceDaemonEndpoint(normalizedHost)) };
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

  const copyUrl = useCallback((label: string, url: string) => {
    copyToComputer(url, { label });
    setMessage('Copied to computer output.');
    setTimeout(() => setMessage(null), 1500);
  }, []);

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
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 8 },
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
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/features/devConnect/DevConnectTab.tsx
git commit -m "refactor: simplify DevConnect UI, auto-detect simulator"
```

---

## Task 4: Support expo-camera for QR Scanning

**Files:**
- Modify: `src/features/devConnect/cameraKit.ts` (rename concept to generic QR scanner loader)
- Modify: `src/features/devConnect/DevConnectQrScanner.tsx`
- Modify: `src/__tests__/features/devConnectQr.test.ts`
- Modify: `package.json` (add expo-camera optional peer dep)

- [ ] **Step 1: Generalize camera module loader**

Replace `src/features/devConnect/cameraKit.ts`:

```typescript
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

// ---- react-native-camera-kit types ----

export interface CameraKitReadCodeEvent {
  nativeEvent?: {
    codeStringValue?: string;
  };
}

export interface CameraKitCameraProps {
  style?: StyleProp<ViewStyle>;
  cameraType?: unknown;
  scanBarcode?: boolean;
  onReadCode?: (event: CameraKitReadCodeEvent) => void;
  showFrame?: boolean;
  laserColor?: string;
  frameColor?: string;
  allowedBarcodeTypes?: string[];
}

export interface CameraKitModule {
  Camera: ComponentType<CameraKitCameraProps>;
  CameraType?: { Back?: unknown };
}

// ---- expo-camera types ----

export interface ExpoCameraScanResult {
  boundingBox?: unknown;
  cornerPoints?: unknown;
  type?: string;
  value?: string;
}

export interface ExpoCameraModule {
  Camera: ComponentType<{
    style?: StyleProp<ViewStyle>;
    onBarCodeScanned?: (result: ExpoCameraScanResult) => void;
    barCodeScannerSettings?: { barCodeTypes: string[] };
  }>;
}

// ---- Unified scanner type ----

export type ScannerKind = 'camera-kit' | 'expo-camera';

export interface ScannerModule {
  kind: ScannerKind;
  Component: ComponentType<unknown>;
  CameraKit?: CameraKitModule;
  ExpoCamera?: ExpoCameraModule;
}

let cached: ScannerModule | null | false = false;

function tryCameraKit(): ScannerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-camera-kit') as Partial<CameraKitModule>;
    if (mod.Camera) {
      return {
        kind: 'camera-kit',
        Component: mod.Camera,
        CameraKit: { Camera: mod.Camera, CameraType: mod.CameraType },
      };
    }
  } catch { /* not installed */ }
  return null;
}

function tryExpoCamera(): ScannerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-camera') as Partial<ExpoCameraModule>;
    if (mod.Camera) {
      return {
        kind: 'expo-camera',
        Component: mod.Camera,
        ExpoCamera: { Camera: mod.Camera },
      };
    }
  } catch { /* not installed */ }
  return null;
}

export function getScannerModule(): ScannerModule | null {
  if (cached !== false) return cached;
  cached = tryCameraKit() ?? tryExpoCamera();
  return cached;
}

export function isCameraKitAvailable(): boolean {
  return getScannerModule() !== null;
}
```

- [ ] **Step 2: Update QR scanner to support both camera libs**

Replace `src/features/devConnect/DevConnectQrScanner.tsx`:

```typescript
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '../../ui/theme/colors';
import {
  getScannerModule,
  type CameraKitReadCodeEvent,
  type ExpoCameraScanResult,
} from './cameraKit';
import { parseMetroQrPayload } from './devConnectUtils';

interface DevConnectQrScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanHost: (host: string) => void;
}

export function DevConnectQrScanner({ visible, onClose, onScanHost }: DevConnectQrScannerProps) {
  const scannedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const scanner = getScannerModule();

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setError(null);
    }
  }, [visible]);

  const handleScanned = useCallback((rawValue: string) => {
    if (scannedRef.current) return;
    if (typeof rawValue !== 'string') return;

    const parsed = parseMetroQrPayload(rawValue);
    if (!parsed) {
      setError('QR code does not contain a supported Metro URL.');
      return;
    }

    scannedRef.current = true;
    setError(null);
    onScanHost(parsed.computerHost);
    onClose();
  }, [onClose, onScanHost]);

  const handleCameraKitRead = useCallback((event: CameraKitReadCodeEvent) => {
    handleScanned(event.nativeEvent?.codeStringValue ?? '');
  }, [handleScanned]);

  const handleExpoScanned = useCallback((result: ExpoCameraScanResult) => {
    handleScanned(result.value ?? '');
  }, [handleScanned]);

  if (!visible || !scanner) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {scanner.kind === 'camera-kit' && scanner.CameraKit ? (
          <scanner.CameraKit.Camera
            style={styles.camera}
            cameraType={scanner.CameraKit.CameraType?.Back}
            scanBarcode
            onReadCode={handleCameraKitRead}
            showFrame
            laserColor={Colors.primary}
            frameColor={Colors.primary}
            allowedBarcodeTypes={['qr']}
          />
        ) : scanner.kind === 'expo-camera' && scanner.ExpoCamera ? (
          <scanner.ExpoCamera.Camera
            style={styles.camera}
            onBarCodeScanned={handleExpoScanned}
            barCodeScannerSettings={{ barCodeTypes: ['qr'] }}
          />
        ) : null}
        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>Scan a Metro QR code.</Text>}
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
        <Pressable style={styles.topClose} onPress={onClose}>
          <Text style={styles.topCloseText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  footer: { padding: 16, backgroundColor: Colors.surface },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  error: { fontSize: 13, color: Colors.error, marginBottom: 12 },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  closeButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  topClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topCloseText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
```

- [ ] **Step 3: Add expo-camera to optional peer dependencies**

Modify `package.json` peerDependencies to include:

```json
"expo-camera": ">=15.0.0"
```

Add to peerDependenciesMeta:

```json
"expo-camera": {
  "optional": true
}
```

- [ ] **Step 4: Update QR tests**

The existing `src/__tests__/features/devConnectQr.test.ts` tests `parseMetroQrPayload` which is unchanged. Verify still passing.

```bash
npm test -- --runInBand src/__tests__/features/devConnectQr.test.ts
```

- [ ] **Step 5: Run all tests and typecheck**

```bash
npm test -- --runInBand
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/features/devConnect/cameraKit.ts src/features/devConnect/DevConnectQrScanner.tsx package.json
git commit -m "feat: support expo-camera for QR scanning"
```

---

## Task 5: Fix Existing Tests for New State Shape

**Files:**
- Modify: any test files that reference `snapshot.mode`, `saveConnectionMode`, `connectionMode`, or the old segment UI.

- [ ] **Step 1: Search for stale references**

```bash
rg -n "saveConnectionMode|connectionMode|segmentButton|handleModeChange|mode === 'device'|mode === 'simulator'" src/__tests__ Demo/__tests__
```

- [ ] **Step 2: Fix each test file based on findings**

Likely fixes:
- `src/__tests__/core/initialize.test.ts` — remove `connectionMode` preference setup, update state assertions to check `isSimulator` instead of `mode`.
- Demo `App.test.tsx` — remove "Simulator"/"Real device" button presses, remove mode persistence assertions. Test simulator/device path via mock.

- [ ] **Step 3: Run all tests**

```bash
npm test -- --runInBand
cd Demo && npm test -- --runInBand
cd ..
npm run typecheck
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: update tests for auto-detected simulator mode"
```

---

## Task 6: Update Docs and README

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Update DevConnect docs**

Replace mode-selection instructions with auto-detection explanation. Mention both `react-native-camera-kit` and `expo-camera` as optional scan dependencies.

- [ ] **Step 2: Stale reference sweep**

```bash
rg -n "connectionMode|saveConnectionMode|Simulator.*Real device|segment" src README.md README.zh-CN.md docs
```

Expected: no stale references in active code/docs.

- [ ] **Step 3: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: update DevConnect for auto-detection and dual camera support"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Full test suite**

```bash
npm test -- --runInBand
cd Demo && npm test -- --runInBand
cd ..
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck
npm run lint
```

- [ ] **Step 3: Package contents**

```bash
npm pack --dry-run
```

- [ ] **Step 4: Whitespace + stale refs**

```bash
git diff --check
rg -n "saveConnectionMode|connectionMode|StreamingSettingsModal|⚙|齿轮" src Demo README.md README.zh-CN.md docs/product-roadmap.md
```

---

## Summary of Changes

| Before | After |
|--------|-------|
| User picks Simulator / Real device | Auto-detected via Platform.constants |
| `connectionMode` persisted in preferences | Removed — mode is runtime detection |
| Segment toggle UI | Hidden on simulator, IP input only on device |
| Status card with dot + target | Removed — leaner layout |
| Only `react-native-camera-kit` | Also supports `expo-camera` |
| Complex multi-section UI | Badge (sim) or IP input (device) + buttons + Metro URLs |
