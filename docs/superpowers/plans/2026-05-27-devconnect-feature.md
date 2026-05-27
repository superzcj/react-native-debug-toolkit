# DevConnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `DevConnect` debug-panel tab that stores a computer IP, shows copyable Metro URLs, and moves existing desktop daemon log sync controls out of the gear modal into the tab.

**Architecture:** Add a focused `src/features/devConnect` feature. Keep Metro support shallow: normalize/store host, display `exp://<host>:8081` and `http://<host>:8081`, copy URLs, and optionally scan a QR code to fill the host. Do not generate Metro config, change bundle source, call DevSettings, or auto-connect Metro. Existing daemon sync stays owned by `DaemonClient`; DevConnect only configures it from stored preferences and exposes Start/Stop/Send Once UI.

**Tech Stack:** React Native, existing feature registry, existing `debugPreferences`, existing `DaemonClient`, existing `copyToComputer`, optional peer dependency `react-native-camera-kit` for QR scanning.

---

## Scope Guardrails

- `computerHost` means normalized IPv4 host only, e.g. `192.168.1.10`.
- Input and QR payload may contain `exp://192.168.1.10:8081`, `http://192.168.1.10:8081`, `192.168.1.10:8081`, or `192.168.1.10`; stored value must be `192.168.1.10`.
- Daemon endpoint must still use port `3799` through `buildDeviceDaemonEndpoint(host)`.
- Metro URLs must use port `8081`.
- QR button must be hidden when `react-native-camera-kit` is unavailable.
- No fake QR button. If camera-kit is unavailable, show no QR UI.
- UI text stays English, matching current toolkit UI.
- Preserve unrelated user edits. Current `README.md` and `README.zh-CN.md` are already modified; update only DevConnect-related lines.

## File Responsibilities

- `src/features/devConnect/devConnectUtils.ts`: pure host parsing and Metro URL building.
- `src/features/devConnect/devConnectPreferences.ts`: preference load/save and daemon settings restore.
- `src/features/devConnect/cameraKit.ts`: optional camera-kit loader.
- `src/features/devConnect/DevConnectQrScanner.tsx`: camera modal, only rendered when camera-kit exists.
- `src/features/devConnect/DevConnectTab.tsx`: tab UI, daemon sync controls, Metro URL copy controls.
- `src/features/devConnect/index.ts`: feature factory and snapshot.
- `src/types/feature.ts`: add built-in feature name.
- `src/core/initialize.ts`: register feature and restore persisted DevConnect settings before daemon restore.
- `src/index.ts`: export public factory/types.
- `src/ui/panel/DebugPanel.tsx`: remove gear modal entry.
- Delete `src/ui/panel/StreamingSettingsModal.tsx` after migration.

---

### Task 1: Add Pure DevConnect URL Utilities

**Files:**
- Create: `src/features/devConnect/devConnectUtils.ts`
- Create: `src/__tests__/features/devConnectUtils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/features/devConnectUtils.test.ts`:

```typescript
import {
  buildMetroUrls,
  normalizeComputerHost,
  parseMetroQrPayload,
} from '../../features/devConnect/devConnectUtils';

describe('devConnectUtils', () => {
  it('normalizes plain IP, IP with port, and Metro URLs to a host only', () => {
    expect(normalizeComputerHost('192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeComputerHost('192.168.1.10:8081')).toBe('192.168.1.10');
    expect(normalizeComputerHost('exp://192.168.1.10:8081')).toBe('192.168.1.10');
    expect(normalizeComputerHost('http://192.168.1.10:8081/index.bundle?platform=ios')).toBe('192.168.1.10');
  });

  it('rejects invalid hosts instead of storing unsafe values', () => {
    expect(normalizeComputerHost('')).toBeNull();
    expect(normalizeComputerHost('999.1.1.1')).toBeNull();
    expect(normalizeComputerHost('localhost:8081')).toBeNull();
    expect(normalizeComputerHost('not an url')).toBeNull();
  });

  it('builds Metro URLs on port 8081 without changing daemon port', () => {
    expect(buildMetroUrls('192.168.1.10')).toEqual({
      expUrl: 'exp://192.168.1.10:8081',
      httpUrl: 'http://192.168.1.10:8081',
    });
    expect(buildMetroUrls('bad host')).toBeNull();
  });

  it('parses QR payloads with the same normalization rules', () => {
    expect(parseMetroQrPayload('exp://192.168.1.10:8081')).toEqual({
      computerHost: '192.168.1.10',
      source: 'exp://192.168.1.10:8081',
    });
    expect(parseMetroQrPayload('bad')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
npm test -- --runInBand src/__tests__/features/devConnectUtils.test.ts
```

Expected: fail because `devConnectUtils.ts` does not exist.

- [ ] **Step 3: Implement pure utilities**

Create `src/features/devConnect/devConnectUtils.ts`:

```typescript
const METRO_PORT = '8081';

export interface MetroUrls {
  expUrl: string;
  httpUrl: string;
}

export interface ParsedMetroQrPayload {
  computerHost: string;
  source: string;
}

function isValidIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255 && String(value) === part;
  });
}

function toUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

export function normalizeComputerHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(toUrlInput(trimmed));
    const host = parsed.hostname.trim();
    return isValidIpv4(host) ? host : null;
  } catch {
    return null;
  }
}

export function buildMetroUrls(rawHost: string): MetroUrls | null {
  const host = normalizeComputerHost(rawHost);
  if (!host) return null;

  return {
    expUrl: `exp://${host}:${METRO_PORT}`,
    httpUrl: `http://${host}:${METRO_PORT}`,
  };
}

export function parseMetroQrPayload(payload: string): ParsedMetroQrPayload | null {
  const computerHost = normalizeComputerHost(payload);
  if (!computerHost) return null;
  return { computerHost, source: payload };
}
```

- [ ] **Step 4: Run tests and verify pass**

```bash
npm test -- --runInBand src/__tests__/features/devConnectUtils.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/devConnect/devConnectUtils.ts src/__tests__/features/devConnectUtils.test.ts
git commit -m "feat: add DevConnect URL utilities"
```

---

### Task 2: Add DevConnect Preferences and Daemon Restore

**Files:**
- Modify: `src/utils/debugPreferences.ts`
- Modify: `src/__tests__/utils/debugPreferences.test.ts`
- Create: `src/features/devConnect/devConnectPreferences.ts`
- Create: `src/__tests__/features/devConnectPreferences.test.ts`

- [ ] **Step 1: Extend preference key tests**

Modify `src/__tests__/utils/debugPreferences.test.ts` key test:

```typescript
  it('exposes expected key constants', () => {
    expect(KEYS.fabPosition).toContain('fab_position');
    expect(KEYS.lastTab).toContain('last_tab');
    expect(KEYS.computerHost).toContain('computer_host');
    expect(KEYS.connectionMode).toContain('connection_mode');
  });
```

- [ ] **Step 2: Run key test and verify failure**

```bash
npm test -- --runInBand src/__tests__/utils/debugPreferences.test.ts
```

Expected: fail because keys do not exist.

- [ ] **Step 3: Add preference keys**

Modify `src/utils/debugPreferences.ts`:

```typescript
export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  consoleLogs: '@react_native_debug_toolkit/console_logs',
  networkLogs: '@react_native_debug_toolkit/network_logs',
  trackLogs: '@react_native_debug_toolkit/track_logs',
  computerHost: '@react_native_debug_toolkit/computer_host',
  connectionMode: '@react_native_debug_toolkit/connection_mode',
} as const;
```

- [ ] **Step 4: Add preferences tests**

Create `src/__tests__/features/devConnectPreferences.test.ts`:

```typescript
import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
  saveConnectionMode,
} from '../../features/devConnect/devConnectPreferences';

describe('devConnectPreferences', () => {
  beforeEach(async () => {
    _resetDaemonClientForTesting();
    await setPreference(KEYS.computerHost, '');
    await setPreference(KEYS.connectionMode, '');
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

  it('persists valid connection mode', async () => {
    await saveConnectionMode('device');

    expect(await getPreference(KEYS.connectionMode)).toBe('device');
    await expect(loadDevConnectPreferences()).resolves.toEqual({
      computerHost: '',
      mode: 'device',
    });
  });

  it('configures daemon from persisted DevConnect settings using daemon port 3799', async () => {
    await setPreference(KEYS.computerHost, 'exp://192.168.1.10:8081');
    await setPreference(KEYS.connectionMode, 'device');

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toEqual({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
      token: '',
    });
  });
});
```

- [ ] **Step 5: Run preferences tests and verify failure**

```bash
npm test -- --runInBand src/__tests__/features/devConnectPreferences.test.ts
```

Expected: fail because `devConnectPreferences.ts` does not exist.

- [ ] **Step 6: Implement preferences module**

Create `src/features/devConnect/devConnectPreferences.ts`:

```typescript
import {
  daemonClient,
  type DaemonConnectionMode,
} from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import { normalizeComputerHost } from './devConnectUtils';

export interface DevConnectPreferences {
  computerHost: string;
  mode: DaemonConnectionMode;
}

function normalizeMode(value: string | null): DaemonConnectionMode {
  return value === 'device' || value === 'simulator' ? value : 'simulator';
}

export async function loadDevConnectPreferences(): Promise<DevConnectPreferences> {
  const [storedHost, storedMode] = await Promise.all([
    getPreference(KEYS.computerHost),
    getPreference(KEYS.connectionMode),
  ]);

  return {
    computerHost: storedHost ? normalizeComputerHost(storedHost) ?? '' : '',
    mode: normalizeMode(storedMode),
  };
}

export async function saveComputerHost(value: string): Promise<string | null> {
  const normalized = normalizeComputerHost(value);
  if (!normalized) return null;
  await setPreference(KEYS.computerHost, normalized);
  return normalized;
}

export async function saveConnectionMode(mode: DaemonConnectionMode): Promise<void> {
  await setPreference(KEYS.connectionMode, mode);
}

export async function restoreDevConnectSettingsToDaemon(): Promise<DevConnectPreferences> {
  const preferences = await loadDevConnectPreferences();
  daemonClient.configure({
    mode: preferences.mode,
    endpoint: '',
    deviceHost: preferences.computerHost,
    token: '',
  });
  return preferences;
}
```

- [ ] **Step 7: Run preferences tests and verify pass**

```bash
npm test -- --runInBand src/__tests__/utils/debugPreferences.test.ts src/__tests__/features/devConnectPreferences.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/utils/debugPreferences.ts src/__tests__/utils/debugPreferences.test.ts src/features/devConnect/devConnectPreferences.ts src/__tests__/features/devConnectPreferences.test.ts
git commit -m "feat: persist DevConnect host and connection mode"
```

---

### Task 3: Add DevConnect Feature Registry and Public Exports

**Files:**
- Create: `src/features/devConnect/types.ts`
- Create: `src/features/devConnect/index.ts`
- Modify: `src/types/feature.ts`
- Modify: `src/core/initialize.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/core/initialize.test.ts`

- [ ] **Step 1: Add initialize tests**

Create `src/__tests__/core/initialize.test.ts`:

```typescript
import { DebugToolkit } from '../../core/DebugToolkit';
import { initializeDebugToolkit } from '../../core/initialize';
import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { KEYS, setPreference } from '../../utils/debugPreferences';

describe('initializeDebugToolkit', () => {
  beforeEach(async () => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
    _resetDaemonClientForTesting();
    await setPreference(KEYS.computerHost, '');
    await setPreference(KEYS.connectionMode, '');
  });

  afterEach(() => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
    _resetDaemonClientForTesting();
  });

  it('registers devConnect in default features', () => {
    initializeDebugToolkit({ enabled: true });

    expect(DebugToolkit.features.map((feature) => feature.name)).toContain('devConnect');
  });

  it('allows devConnect to be disabled through feature config', () => {
    initializeDebugToolkit({
      enabled: true,
      features: {
        network: true,
        console: true,
        devConnect: false,
      },
    });

    expect(DebugToolkit.features.map((feature) => feature.name)).toEqual(['network', 'console']);
  });

  it('restores persisted DevConnect settings before daemon restore can use them', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');
    await setPreference(KEYS.connectionMode, 'device');

    initializeDebugToolkit({ enabled: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
    });
  });
});
```

- [ ] **Step 2: Run initialize tests and verify failure**

```bash
npm test -- --runInBand src/__tests__/core/initialize.test.ts
```

Expected: fail because `devConnect` is not registered.

- [ ] **Step 3: Add DevConnect types**

Create `src/features/devConnect/types.ts`:

```typescript
import type { DaemonConnectionMode, StreamStatus } from '../../utils/DaemonClient';

export interface DevConnectState {
  computerHost: string;
  mode: DaemonConnectionMode;
  qrAvailable: boolean;
  streaming: boolean;
  streamStatus: StreamStatus | null;
}
```

- [ ] **Step 4: Add feature factory**

Create `src/features/devConnect/index.ts`:

```typescript
import { DevConnectTab } from './DevConnectTab';
import { isCameraKitAvailable } from './cameraKit';
import { loadDevConnectPreferences } from './devConnectPreferences';
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
  saveConnectionMode,
} from './devConnectPreferences';

export const createDevConnectFeature = (): DebugFeature<DevConnectState> => {
  const listeners = new Set<DebugFeatureListener>();
  let state: DevConnectState = {
    computerHost: '',
    mode: daemonClient.getSettings().mode,
    qrAvailable: isCameraKitAvailable(),
    streaming: daemonClient.isConnected(),
    streamStatus: daemonClient.getStatus(),
  };

  const notify = () => {
    state = {
      ...state,
      mode: daemonClient.getSettings().mode,
      streaming: daemonClient.isConnected(),
      streamStatus: daemonClient.getStatus(),
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
          mode: preferences.mode,
        };
        notify();
      }).catch(() => {
        notify();
      });
    },
    getSnapshot: () => state,
    cleanup() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
```

- [ ] **Step 5: Add temporary camera-kit stub so feature compiles**

Create `src/features/devConnect/cameraKit.ts`:

```typescript
export function isCameraKitAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cameraKit = require('react-native-camera-kit');
    return Boolean(cameraKit?.Camera);
  } catch {
    return false;
  }
}
```

Task 5 will replace this with typed loader used by QR scanner.

- [ ] **Step 6: Add temporary tab stub so registry compiles**

Create `src/features/devConnect/DevConnectTab.tsx`:

```typescript
import React from 'react';
import { Text, View } from 'react-native';
import type { DebugFeatureRenderProps } from '../../types';
import type { DevConnectState } from './types';

export function DevConnectTab({ snapshot }: DebugFeatureRenderProps<DevConnectState>) {
  return (
    <View>
      <Text>DevConnect</Text>
      <Text>{snapshot.computerHost || 'No computer IP set'}</Text>
    </View>
  );
}
```

Task 4 replaces this stub with the full UI.

- [ ] **Step 7: Extend built-in feature type**

Modify `src/types/feature.ts`:

```typescript
export type BuiltInFeatureName =
  | 'network'
  | 'console'
  | 'zustand'
  | 'navigation'
  | 'track'
  | 'environment'
  | 'clipboard'
  | 'devConnect';
```

- [ ] **Step 8: Register feature and restore preferences before daemon restore**

Modify `src/core/initialize.ts` imports:

```typescript
import { createDevConnectFeature, restoreDevConnectSettingsToDaemon } from '../features/devConnect';
```

Modify `FeatureConfigs`:

```typescript
export interface FeatureConfigs {
  network?: boolean | NetworkFeatureConfig;
  console?: boolean | ConsoleFeatureConfig;
  zustand?: boolean | ZustandFeatureConfig;
  navigation?: boolean | NavigationFeatureConfig;
  track?: boolean | TrackFeatureConfig;
  environment?: Parameters<typeof createEnvironmentFeature>[0];
  clipboard?: boolean;
  devConnect?: boolean;
}
```

Modify `featureRegistry`:

```typescript
const featureRegistry: Record<BuiltInFeatureName, (config?: any) => AnyDebugFeature> = {
  network: createNetworkFeature,
  console: createConsoleLogFeature,
  zustand: createZustandLogFeature,
  navigation: createNavigationLogFeature,
  track: createTrackFeature,
  environment: createEnvironmentFeature,
  clipboard: createClipboardFeature,
  devConnect: createDevConnectFeature,
};
```

Modify `DEFAULT_FEATURES`:

```typescript
const DEFAULT_FEATURES: BuiltInFeatureName[] = [
  'network',
  'console',
  'navigation',
  'zustand',
  'track',
  'clipboard',
  'devConnect',
];
```

Replace direct daemon restore:

```typescript
restoreDevConnectSettingsToDaemon()
  .then(() => daemonClient.restore())
  .catch(() => {
    daemonClient.restore().catch(() => {});
  });
```

- [ ] **Step 9: Export public API**

Modify `src/index.ts` feature factory section:

```typescript
export { createDevConnectFeature } from './features/devConnect';
export type { DevConnectState } from './features/devConnect';
```

- [ ] **Step 10: Run tests and typecheck**

```bash
npm test -- --runInBand src/__tests__/core/initialize.test.ts src/__tests__/features/devConnectPreferences.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 11: Commit**

```bash
git add src/features/devConnect src/types/feature.ts src/core/initialize.ts src/index.ts src/__tests__/core/initialize.test.ts
git commit -m "feat: register DevConnect feature"
```

---

### Task 4: Replace Stub With DevConnect Tab UI

**Files:**
- Modify: `src/features/devConnect/DevConnectTab.tsx`
- Modify: `Demo/__tests__/react-native.mock.js`
- Modify: `Demo/__tests__/App.test.tsx`

- [ ] **Step 1: Update Demo AsyncStorage mock shape**

Modify `Demo/__tests__/App.test.tsx` mock so both direct and default AsyncStorage imports work:

```typescript
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
  getItem: mockAsyncStorage.getItem,
  setItem: mockAsyncStorage.setItem,
}), { virtual: true });
```

- [ ] **Step 2: Replace desktop logs test flow**

Update the test currently named `shows desktop logs settings with simulator and real device choices`:

```typescript
test('shows DevConnect tab with daemon controls and Metro URLs', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => [],
  }) as unknown as typeof fetch;

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Profile');
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Open Panel');
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(renderer!.root.findAll((node) => (
    (node.type as unknown) === 'Text' && node.props.children === '⚙'
  ))).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'DevConnect');
    await Promise.resolve();
  });

  expect(findText(renderer!.root, 'Desktop Sync')).toBeTruthy();
  expect(findText(renderer!.root, 'Simulator')).toBeTruthy();
  expect(findText(renderer!.root, 'Real device')).toBeTruthy();
  expect(findText(renderer!.root, 'Start Live Sync')).toBeTruthy();
  expect(findText(renderer!.root, 'Send Once')).toBeTruthy();
  expect(findText(renderer!.root, 'Metro Bundler')).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Real device');
    typeIntoPlaceholder(renderer!.root, '192.168.1.10', '192.168.1.10');
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(findText(renderer!.root, 'exp://192.168.1.10:8081')).toBeTruthy();
  expect(findText(renderer!.root, 'http://192.168.1.10:8081')).toBeTruthy();
  expect(renderer!.root.findByProps({ placeholder: '192.168.1.10' }).props).toMatchObject({
    keyboardType: 'numbers-and-punctuation',
    returnKeyType: 'done',
  });

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
```

- [ ] **Step 3: Update Send Once tests to use DevConnect tab**

In the two existing Send Once tests, replace gear open:

```typescript
await ReactTestRenderer.act(async () => {
  pressText(renderer!.root, 'DevConnect');
  await Promise.resolve();
});
```

Then keep:

```typescript
pressText(renderer!.root, 'Real device');
typeIntoPlaceholder(renderer!.root, '192.168.1.10', '192.168.1.10');
pressText(renderer!.root, 'Send Once');
```

Update persistence expectations:

```typescript
expect(mockDaemonSettings.get('@react_native_debug_toolkit/connection_mode')).toBe('device');
expect(mockDaemonSettings.get('@react_native_debug_toolkit/computer_host')).toBe('192.168.1.10');
```

- [ ] **Step 4: Run Demo tests and verify failure**

```bash
cd Demo && npm test -- --runInBand __tests__/App.test.tsx
```

Expected: fail because DevConnect full UI is not implemented and gear still exists.

- [ ] **Step 5: Implement DevConnect tab**

Replace `src/features/devConnect/DevConnectTab.tsx` with:

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
  type DaemonConnectionMode,
  type DaemonSettings,
} from '../../utils/DaemonClient';
import { buildMetroUrls, normalizeComputerHost } from './devConnectUtils';
import { saveComputerHost, saveConnectionMode } from './devConnectPreferences';
import type { DevConnectState } from './types';

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

  useEffect(() => {
    setComputerHost(snapshot.computerHost);
    setMode(snapshot.mode);
    setStreaming(snapshot.streaming);
    setSyncState(snapshot.streaming ? 'running' : 'idle');
  }, [snapshot.computerHost, snapshot.mode, snapshot.streaming]);

  const metroUrls = buildMetroUrls(computerHost);

  const getSettings = useCallback((): DaemonSettings => ({
    mode,
    endpoint: '',
    deviceHost: computerHost,
    token: '',
  }), [computerHost, mode]);

  const handleHostChange = useCallback((value: string) => {
    setComputerHost(value);
    const normalized = normalizeComputerHost(value);
    if (normalized) {
      saveComputerHost(normalized).catch(() => {});
    }
    if (syncState === 'failed') setSyncState('idle');
    setMessage(null);
  }, [syncState]);

  const handleModeChange = useCallback((nextMode: DaemonConnectionMode) => {
    setMode(nextMode);
    saveConnectionMode(nextMode).catch(() => {});
    setMessage(null);
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
  const statusTitle = sending
    ? 'Sending'
    : syncState === 'checking'
      ? 'Checking'
      : streaming && syncState === 'retrying'
        ? 'Retrying desktop sync'
        : syncState === 'failed'
          ? 'Failed'
          : streaming
            ? 'Live sync running'
            : mode === 'device' && !normalizeComputerHost(computerHost)
              ? 'Enter computer IP'
              : 'Ready';

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
  input: {
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

- [ ] **Step 6: Run Demo test and root typecheck**

```bash
cd Demo && npm test -- --runInBand __tests__/App.test.tsx
cd ..
npm run typecheck
```

Expected: Demo tests still fail on gear removal until Task 6; typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add src/features/devConnect/DevConnectTab.tsx Demo/__tests__/App.test.tsx
git commit -m "feat: add DevConnect tab UI"
```

---

### Task 5: Add Optional QR Scanner

**Files:**
- Modify: `package.json`
- Modify: `src/features/devConnect/cameraKit.ts`
- Create: `src/features/devConnect/DevConnectQrScanner.tsx`
- Modify: `src/features/devConnect/DevConnectTab.tsx`
- Create: `src/__tests__/features/devConnectQr.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Add QR utility tests**

Create `src/__tests__/features/devConnectQr.test.ts`:

```typescript
import { parseMetroQrPayload } from '../../features/devConnect/devConnectUtils';

describe('DevConnect QR payload parsing', () => {
  it('accepts Expo-style Metro URLs', () => {
    expect(parseMetroQrPayload('exp://192.168.31.8:8081')).toEqual({
      computerHost: '192.168.31.8',
      source: 'exp://192.168.31.8:8081',
    });
  });

  it('accepts HTTP Metro URLs', () => {
    expect(parseMetroQrPayload('http://192.168.31.8:8081/index.bundle?platform=ios')).toEqual({
      computerHost: '192.168.31.8',
      source: 'http://192.168.31.8:8081/index.bundle?platform=ios',
    });
  });
});
```

- [ ] **Step 2: Add optional peer dependency metadata**

Modify `package.json`:

```json
"peerDependencies": {
  "@react-native-clipboard/clipboard": ">=1.0.0",
  "react": ">=18.0.0",
  "react-native": ">=0.72.0",
  "react-native-camera-kit": ">=18.0.0"
},
"peerDependenciesMeta": {
  "@react-native-clipboard/clipboard": {
    "optional": true
  },
  "react-native-camera-kit": {
    "optional": true
  }
}
```

- [ ] **Step 3: Replace camera-kit loader with typed loader**

Replace `src/features/devConnect/cameraKit.ts`:

```typescript
import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

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
  CameraType?: {
    Back?: unknown;
  };
}

let cachedModule: CameraKitModule | null | false = false;

export function getCameraKitModule(): CameraKitModule | null {
  if (cachedModule !== false) return cachedModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-camera-kit') as Partial<CameraKitModule>;
    if (mod.Camera) {
      cachedModule = {
        Camera: mod.Camera,
        CameraType: mod.CameraType,
      };
      return cachedModule;
    }
  } catch {
    cachedModule = null;
    return null;
  }

  cachedModule = null;
  return null;
}

export function isCameraKitAvailable(): boolean {
  return getCameraKitModule() !== null;
}
```

- [ ] **Step 4: Add QR scanner modal**

Create `src/features/devConnect/DevConnectQrScanner.tsx`:

```typescript
import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '../../ui/theme/colors';
import { getCameraKitModule, type CameraKitReadCodeEvent } from './cameraKit';
import { parseMetroQrPayload } from './devConnectUtils';

interface DevConnectQrScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanHost: (host: string) => void;
}

export function DevConnectQrScanner({ visible, onClose, onScanHost }: DevConnectQrScannerProps) {
  const scannedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const cameraKit = getCameraKitModule();

  const handleReadCode = useCallback((event: CameraKitReadCodeEvent) => {
    if (scannedRef.current) return;
    const rawValue = event.nativeEvent?.codeStringValue;
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

  if (!visible || !cameraKit) return null;

  const Camera = cameraKit.Camera;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Camera
          style={styles.camera}
          cameraType={cameraKit.CameraType?.Back}
          scanBarcode
          onReadCode={handleReadCode}
          showFrame
          laserColor={Colors.primary}
          frameColor={Colors.primary}
          allowedBarcodeTypes={['qr']}
        />
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
  footer: {
    padding: 16,
    backgroundColor: Colors.surface,
  },
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

- [ ] **Step 5: Wire QR scanner into tab only when available**

Modify `src/features/devConnect/DevConnectTab.tsx` imports:

```typescript
import { DevConnectQrScanner } from './DevConnectQrScanner';
```

Add state:

```typescript
const [qrVisible, setQrVisible] = useState(false);
```

Add handler:

```typescript
const handleQrHost = useCallback((host: string) => {
  setComputerHost(host);
  saveComputerHost(host).catch(() => {});
  setMessage('Computer IP updated from QR code.');
}, []);
```

Replace Computer IP input block with row:

```typescript
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
```

Render scanner before closing `KeyboardAvoidingView`:

```typescript
<DevConnectQrScanner
  visible={qrVisible}
  onClose={() => setQrVisible(false)}
  onScanHost={handleQrHost}
/>
```

Add styles:

```typescript
inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
```

Change `input` style to include `flex: 1`.

- [ ] **Step 6: Update docs for optional QR**

In `README.md`, add under Device Setup:

```markdown
QR scan is optional. Install `react-native-camera-kit` in the app to show the DevConnect scan button. The app must provide camera permission strings and request camera permission before using the scanner.
```

In `README.zh-CN.md`, add under device connection:

```markdown
扫码是可选能力。App 安装 `react-native-camera-kit` 后，DevConnect 才显示扫码按钮。App 仍需自己配置相机权限文案，并在使用扫码前申请相机权限。
```

- [ ] **Step 7: Run tests and typecheck**

```bash
npm test -- --runInBand src/__tests__/features/devConnectQr.test.ts src/__tests__/features/devConnectUtils.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add package.json src/features/devConnect/cameraKit.ts src/features/devConnect/DevConnectQrScanner.tsx src/features/devConnect/DevConnectTab.tsx src/__tests__/features/devConnectQr.test.ts README.md README.zh-CN.md
git commit -m "feat: add optional DevConnect QR scanner"
```

---

### Task 6: Remove Gear Modal and Update Docs

**Files:**
- Modify: `src/ui/panel/DebugPanel.tsx`
- Delete: `src/ui/panel/StreamingSettingsModal.tsx`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `Demo/README.md`
- Modify: `docs/product-roadmap.md`
- Modify: `Demo/__tests__/App.test.tsx`

- [ ] **Step 1: Remove gear modal from DebugPanel**

Modify `src/ui/panel/DebugPanel.tsx`:

```typescript
import React, { useCallback, useEffect, useRef } from 'react';
```

Remove:

```typescript
import { StreamingSettingsModal } from './StreamingSettingsModal';
const [settingsVisible, setSettingsVisible] = useState(false);
```

Remove gear button JSX:

```typescript
<TouchableOpacity
  onPress={() => setSettingsVisible(true)}
  style={styles.settingsButton}
  activeOpacity={0.6}
>
  <Text style={styles.settingsButtonText}>⚙</Text>
</TouchableOpacity>
```

Remove modal JSX:

```typescript
<StreamingSettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
```

Remove styles:

```typescript
settingsButton: { ... },
settingsButtonText: { ... },
```

- [ ] **Step 2: Delete old modal**

```bash
git rm src/ui/panel/StreamingSettingsModal.tsx
```

- [ ] **Step 3: Update docs text**

Replace README line:

```markdown
In the app, open Debug Panel -> gear -> `Send Once` or `Start Live Sync`.
```

with:

```markdown
In the app, open Debug Panel -> `DevConnect` -> `Send Once` or `Start Live Sync`.
```

Replace README.zh-CN line:

```markdown
App 内打开 Debug Panel -> 齿轮 -> `Send Once` 或 `Start Live Sync`。
```

with:

```markdown
App 内打开 Debug Panel -> `DevConnect` -> `Send Once` 或 `Start Live Sync`。
```

Replace Demo README line:

```markdown
In app: `DBG` -> gear -> `Send Once` or `Start Live Sync`.
```

with:

```markdown
In app: `DBG` -> `DevConnect` -> `Send Once` or `Start Live Sync`.
```

Update `docs/product-roadmap.md` current capabilities:

```markdown
- DevConnect：真机电脑 IP、Metro URL 复制、Desktop Logs `Send Once` / `Start Live Sync`
```

- [ ] **Step 4: Search stale references**

```bash
rg -n "StreamingSettingsModal|Desktop Logs|gear|齿轮|⚙" src Demo README.md README.zh-CN.md docs/product-roadmap.md
```

Expected: no stale references except historical design docs under `docs/designs/`.

- [ ] **Step 5: Run focused tests**

```bash
cd Demo && npm test -- --runInBand __tests__/App.test.tsx
cd ..
npm test -- --runInBand src/__tests__/core/initialize.test.ts src/__tests__/features/devConnectUtils.test.ts src/__tests__/features/devConnectPreferences.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panel/DebugPanel.tsx README.md README.zh-CN.md Demo/README.md docs/product-roadmap.md Demo/__tests__/App.test.tsx
git add -u src/ui/panel/StreamingSettingsModal.tsx
git commit -m "refactor: move desktop logs into DevConnect tab"
```

---

### Task 7: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run root Jest**

```bash
npm test -- --runInBand
```

Expected: all root tests pass.

- [ ] **Step 2: Run root typecheck**

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run root lint**

```bash
npm run lint
```

Expected: no ESLint errors.

- [ ] **Step 4: Run Demo Jest**

```bash
cd Demo && npm test -- --runInBand
cd ..
```

Expected: all Demo tests pass.

- [ ] **Step 5: Verify package contents**

```bash
npm pack --dry-run
```

Expected: new `src/features/devConnect/*` files included, `src/ui/panel/StreamingSettingsModal.tsx` absent from packed files.

- [ ] **Step 6: Check whitespace**

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 7: Final stale-reference sweep**

```bash
rg -n "StreamingSettingsModal|Desktop Logs|gear|齿轮|⚙" src Demo README.md README.zh-CN.md docs/product-roadmap.md
```

Expected: no stale references in active code/docs.

---

## Self-Review

- Spec coverage:
  - Computer IP storage: Task 2.
  - Metro URL display/copy: Task 1 and Task 4.
  - QR optional peer dep: Task 5.
  - New Debug Panel Tab: Task 3 and Task 4.
  - Daemon sync merged from old modal: Task 4 and Task 6.
  - Old Desktop Logs modal removed: Task 6.
  - No automatic Metro config or connection: Scope Guardrails.
- Risk checks:
  - Metro port `8081` never flows into daemon endpoint; Task 2 test locks daemon port `3799`.
  - QR button hidden unless `react-native-camera-kit` exists.
  - README changes must preserve current unrelated edits because docs are already dirty.
- Verification gates:
  - Root Jest, typecheck, lint, Demo Jest, pack dry-run, diff check, stale-reference sweep.
