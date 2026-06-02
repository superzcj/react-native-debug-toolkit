# Native Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` tracking.

**Goal:** Built-in Native Logs feature. Collects/displays native app-process logs in RN Debug Toolkit panel. Streams to daemon, Web Console, HTTP API, MCP tools.

**Architecture:** `native` as normal built-in feature beside `console`, `network`, `devConnect`. Android: current app-process `logcat` via native module. iOS: RN native logs via `RCTAddLogFunction`. JS: drains native buffers on interval, persists under current-session `native_logs`, renders Native tab. Existing DevConnect report/delta flow syncs entries. `enabled: true` is the only release opt-in — no second release switch.

**Tech Stack:** RN legacy NativeModules, TypeScript, Java, Objective-C++, Jest, Node daemon/MCP, CocoaPods podspec.

---

## Scope Rules

- Default unchanged: no `enabled` option → debug enabled, release disabled.
- `enabled: true` → toolkit enabled in debug+release. Native Logs starts when feature config enables `native`.
- `enabled: false` → toolkit and native capture disabled.
- No `allowReleaseNativeLogs`, `releaseNativeLogs`, or second release gate.
- Android: app-visible logs only. No `READ_LOGS`. No all-device capture.
- iOS: `RCTLog*` via RN API only. No `stderr`, `NSLog`, or `os_log` interception.
- Mac sync: current-session scope. `Send Once` = snapshot. `Start Live Sync` = full report + deltas.

## File Map

| Action | Path |
|--------|------|
| Create | `src/features/nativeLogs/index.ts` — feature factory, polling, filtering, persistence, test reset |
| Create | `src/features/nativeLogs/nativeLogsBridge.ts` — typed JS wrapper for `NativeModules.DebugToolkitNativeLogs` |
| Create | `src/features/nativeLogs/NativeLogTab.tsx` — in-app list/detail UI |
| Create | `android/src/main/java/.../DebugToolkitNativeLogsModule.java` — Android logcat collector + ring buffer |
| Create | `ios/DebugToolkitNativeLogs.mm` — iOS `RCTAddLogFunction` collector + ring buffer |
| Modify | `android/.../ReactNativeDebugToolkitPackage.java` — register module |
| Modify | `src/core/initialize.ts` — built-in feature config + registry entry |
| Modify | `src/ui/DebugView.tsx` — default `native: true` |
| Modify | `src/types/feature.ts` — add `native` built-in feature name |
| Modify | `src/types/logs.ts`, `src/types/index.ts` — export `NativeLogEntry` |
| Modify | `src/utils/SessionManager.ts` — add `native_logs` feature key |
| Modify | `src/index.ts` — export native feature factory + config types |
| Modify | `node/mcp/src/logs.js`, `node/mcp/src/tools.js` — allow `logType: "native"` |
| Modify | `node/daemon/src/console/console.html` — Native label, summary, detail renderer |
| Modify | `README.md`, `README.zh-CN.md` — document Native Logs + `enabled: true` semantics |
| Add tests | `src/__tests__/features/`, `src/__tests__/core/`, `src/__tests__/utils/`, `node/mcp/__tests__/`, `node/daemon/__tests__/` |

---

### Task 1: Add Native Log Types And Built-In Wiring Tests

**Files:** `src/__tests__/core/initialize.test.ts`, `src/types/feature.ts`, `src/types/logs.ts`, `src/types/index.ts`, `src/core/initialize.ts`, `src/ui/DebugView.tsx`, `src/index.ts`, `src/features/nativeLogs/index.ts`

- [ ] **Step 1: Write failing built-in feature tests**

Add to `src/__tests__/core/initialize.test.ts`:

```ts
it('registers native logs in default features', async () => {
  await initializeDebugToolkit({ enabled: true });
  expect(DebugToolkit.features.map((f) => f.name)).toContain('native');
});

it('allows native logs to be disabled through feature config', async () => {
  await initializeDebugToolkit({ enabled: true, features: { native: false, console: true } });
  expect(DebugToolkit.features.map((f) => f.name)).toEqual(['console']);
});

it('uses enabled true as the release opt-in without a native-specific release flag', async () => {
  await initializeDebugToolkit({ enabled: true, features: { native: true } });
  expect(DebugToolkit.enabled).toBe(true);
  expect(DebugToolkit.features.map((f) => f.name)).toEqual(['native']);
});
```

- [ ] **Step 2: Run failing test**

```bash
npx jest src/__tests__/core/initialize.test.ts --runInBand
```

Expected: FAIL — unknown/absent `native` built-in feature.

- [ ] **Step 3: Add public native log types**

In `src/types/logs.ts`:

```ts
export type NativeLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'unknown';
export type NativeLogSource = 'logcat' | 'rctLog' | 'manual';

export interface NativeLogEntry {
  id: string;
  timestamp: number;
  platform: 'android' | 'ios' | 'unknown';
  level: NativeLogLevel;
  source: NativeLogSource;
  message: string;
  tag?: string;
  thread?: string;
  file?: string;
  line?: number;
  raw?: string;
}
```

In `src/types/index.ts`, export `NativeLogEntry`, `NativeLogLevel`, `NativeLogSource` from `./logs`.

- [ ] **Step 4: Add `native` feature name**

In `src/types/feature.ts`, add to `BuiltInFeatureName`:

```ts
export type BuiltInFeatureName =
  | 'network' | 'console' | 'native' | 'zustand' | 'navigation'
  | 'track' | 'environment' | 'clipboard' | 'devConnect';
```

- [ ] **Step 5: Add temporary feature factory stub**

Create `src/features/nativeLogs/index.ts` (Task 3 replaces body):

```ts
import type { DebugFeature, NativeLogEntry } from '../../types';

export interface NativeLogsFeatureConfig {
  maxLogs?: number;
  pollIntervalMs?: number;
  minLevel?: NativeLogEntry['level'];
  includeTags?: Array<string | RegExp>;
  excludeTags?: Array<string | RegExp>;
}

export const createNativeLogsFeature = (
  _config?: NativeLogsFeatureConfig,
): DebugFeature<NativeLogEntry[]> => ({
  name: 'native',
  label: 'Native',
  setup: () => {},
  getSnapshot: () => [],
  clear: () => {},
  cleanup: () => {},
});
```

- [ ] **Step 6: Wire feature registry and DebugView defaults**

In `src/core/initialize.ts`:

```ts
import { createNativeLogsFeature } from '../features/nativeLogs';
import type { NativeLogsFeatureConfig } from '../features/nativeLogs';
```

Add to `FeatureConfigs`: `native?: boolean | NativeLogsFeatureConfig;`

Add to `featureRegistry`:
```ts
native: (config, runtime) => createNativeLogsFeature(config as NativeLogsFeatureConfig | undefined, runtime),
```

Add `native` to `DEFAULT_FEATURES` after `console`:
```ts
const DEFAULT_FEATURES: BuiltInFeatureName[] = [
  'network', 'console', 'native', 'navigation', 'zustand', 'track', 'clipboard', 'devConnect',
];
```

In `src/ui/DebugView.tsx`, add default: `native: true,`

In `src/index.ts`:
```ts
export { createNativeLogsFeature } from './features/nativeLogs';
export type { NativeLogsFeatureConfig } from './features/nativeLogs';
export type { NativeLogEntry, NativeLogLevel, NativeLogSource } from './types';
```

- [ ] **Step 7: Run test**

```bash
npx jest src/__tests__/core/initialize.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/core/initialize.test.ts src/types/feature.ts src/types/logs.ts src/types/index.ts src/core/initialize.ts src/ui/DebugView.tsx src/index.ts src/features/nativeLogs/index.ts
git commit -m "feat: register native logs feature"
```

---

### Task 2: Add Native Logs Session Persistence Key

**Files:** `src/utils/SessionManager.ts`, `src/__tests__/features/sessionLogStorage.test.ts`

- [ ] **Step 1: Write failing persistence cleanup test**

Add to `src/__tests__/features/sessionLogStorage.test.ts`:

```ts
it('persists native logs under the current session key and cleans old native sessions', async () => {
  const logStorage = new MemoryStorageAdapter();
  const sessionManager = new SessionManager(logStorage, { maxSessions: 1 });
  const storageKey = sessionManager.getLogStorageKey('native_logs');

  await logStorage.setItem(storageKey, JSON.stringify([{ id: 'n1', message: 'boot' }]));
  await sessionManager.initialize();

  expect(await logStorage.getItem(storageKey)).toContain('boot');

  const oldSessionId = 'old-session';
  await logStorage.setItem(
    sessionManager.getLogStorageKey('native_logs', oldSessionId),
    JSON.stringify([{ id: 'old', message: 'stale' }]),
  );
  await logStorage.setItem('@react_native_debug_toolkit/sessions', JSON.stringify({
    currentSessionId: oldSessionId,
    sessions: [{ id: oldSessionId, startedAt: 1 }, sessionManager.getCurrentSession()],
    maxSessions: 1,
  }));

  const removed = await sessionManager.cleanupOldSessions();

  expect(removed).toBe(1);
  expect(await logStorage.getItem(sessionManager.getLogStorageKey('native_logs', oldSessionId))).toBeNull();
});
```

- [ ] **Step 2: Run failing test**

```bash
npx jest src/__tests__/features/sessionLogStorage.test.ts --runInBand
```

Expected: FAIL — `native_logs` not assignable to `LogFeatureKey`.

- [ ] **Step 3: Add `native_logs` to session manager**

In `src/utils/SessionManager.ts`:

```ts
export type LogFeatureKey = 'console_logs' | 'network_logs' | 'native_logs' | 'track_logs';
```

```ts
const DEFAULT_FEATURE_KEYS: LogFeatureKey[] = ['console_logs', 'network_logs', 'native_logs', 'track_logs'];
```

- [ ] **Step 4: Run test**

```bash
npx jest src/__tests__/features/sessionLogStorage.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/SessionManager.ts src/__tests__/features/sessionLogStorage.test.ts
git commit -m "feat: persist native logs by session"
```

---

### Task 3: Implement JS Native Logs Feature

**Files:** `src/features/nativeLogs/nativeLogsBridge.ts`, `src/features/nativeLogs/index.ts`, `src/features/nativeLogs/NativeLogTab.tsx`, `src/__tests__/features/nativeLogs.test.ts`, `src/__tests__/features/nativeLogsBridge.test.ts`

- [ ] **Step 1: Write bridge tests**

Create `src/__tests__/features/nativeLogsBridge.test.ts`:

```ts
import { NativeModules } from 'react-native';
import {
  drainNativeLogs, getNativeLogsStatus, isNativeLogsAvailable,
  startNativeLogCapture, stopNativeLogCapture,
} from '../../features/nativeLogs/nativeLogsBridge';

describe('nativeLogsBridge', () => {
  beforeEach(() => { delete NativeModules.DebugToolkitNativeLogs; });

  it('reports unavailable when native module is missing', () => {
    expect(isNativeLogsAvailable()).toBe(false);
  });

  it('starts, drains, and stops native capture through the native module', async () => {
    NativeModules.DebugToolkitNativeLogs = {
      startCapture: jest.fn(async () => ({ ok: true })),
      drainLogs: jest.fn(async () => [{ timestamp: 1, platform: 'android', level: 'info', source: 'logcat', message: 'ready' }]),
      stopCapture: jest.fn(async () => ({ ok: true })),
      getStatus: jest.fn(async () => ({ available: true, capturing: true })),
    };

    await startNativeLogCapture({ minLevel: 'info' });
    await expect(drainNativeLogs(10)).resolves.toEqual([
      { timestamp: 1, platform: 'android', level: 'info', source: 'logcat', message: 'ready' },
    ]);
    await stopNativeLogCapture();
    await expect(getNativeLogsStatus()).resolves.toEqual({ available: true, capturing: true });

    expect(NativeModules.DebugToolkitNativeLogs.startCapture).toHaveBeenCalledWith({ minLevel: 'info' });
    expect(NativeModules.DebugToolkitNativeLogs.drainLogs).toHaveBeenCalledWith(10);
    expect(NativeModules.DebugToolkitNativeLogs.stopCapture).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run failing bridge tests**

```bash
npx jest src/__tests__/features/nativeLogsBridge.test.ts --runInBand
```

Expected: FAIL — `nativeLogsBridge.ts` does not exist.

- [ ] **Step 3: Implement native bridge wrapper**

Create `src/features/nativeLogs/nativeLogsBridge.ts`:

```ts
import { NativeModules } from 'react-native';
import type { NativeLogEntry } from '../../types';

interface NativeLogsModule {
  startCapture?: (options?: Record<string, unknown>) => Promise<{ ok: boolean }>;
  stopCapture?: () => Promise<{ ok: boolean }>;
  drainLogs?: (max?: number) => Promise<Array<Omit<NativeLogEntry, 'id'>>>;
  getStatus?: () => Promise<{ available: boolean; capturing: boolean; error?: string }>;
}

function getNativeModule(): NativeLogsModule | null {
  const mod = NativeModules.DebugToolkitNativeLogs as NativeLogsModule | undefined;
  if (!mod || typeof mod.drainLogs !== 'function') return null;
  return mod;
}

export function isNativeLogsAvailable(): boolean {
  return getNativeModule() !== null;
}

export async function startNativeLogCapture(options?: Record<string, unknown>): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.startCapture) return false;
  try { const r = await mod.startCapture(options ?? {}); return r?.ok === true; }
  catch { return false; }
}

export async function stopNativeLogCapture(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.stopCapture) return false;
  try { const r = await mod.stopCapture(); return r?.ok === true; }
  catch { return false; }
}

export async function drainNativeLogs(max = 100): Promise<Array<Omit<NativeLogEntry, 'id'>>> {
  const mod = getNativeModule();
  if (!mod?.drainLogs) return [];
  try { const entries = await mod.drainLogs(Math.max(1, Math.floor(max))); return Array.isArray(entries) ? entries : []; }
  catch { return []; }
}

export async function getNativeLogsStatus(): Promise<{ available: boolean; capturing: boolean; error?: string }> {
  const mod = getNativeModule();
  if (!mod?.getStatus) return { available: false, capturing: false };
  try {
    const s = await mod.getStatus();
    return { available: s?.available === true, capturing: s?.capturing === true, error: typeof s?.error === 'string' ? s.error : undefined };
  } catch (error) {
    return { available: true, capturing: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 4: Run bridge tests**

```bash
npx jest src/__tests__/features/nativeLogsBridge.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Write feature lifecycle tests**

Create `src/__tests__/features/nativeLogs.test.ts`:

```ts
import { NativeModules } from 'react-native';
import { createNativeLogsFeature, _resetNativeLogsForTesting } from '../../features/nativeLogs';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { SessionManager } from '../../utils/SessionManager';

describe('createNativeLogsFeature', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    NativeModules.DebugToolkitNativeLogs = {
      startCapture: jest.fn(async () => ({ ok: true })),
      drainLogs: jest.fn(async () => [
        { timestamp: 10, platform: 'android', level: 'info', source: 'logcat', tag: 'Demo', message: 'ready' },
        { timestamp: 11, platform: 'android', level: 'debug', source: 'logcat', tag: 'Skip', message: 'ignore' },
      ]),
      stopCapture: jest.fn(async () => ({ ok: true })),
      getStatus: jest.fn(async () => ({ available: true, capturing: true })),
    };
    _resetNativeLogsForTesting();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete NativeModules.DebugToolkitNativeLogs;
    _resetNativeLogsForTesting();
  });

  it('starts native capture, drains logs, filters tags, and stores entries', async () => {
    const logStorage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(logStorage);
    const feature = createNativeLogsFeature(
      { pollIntervalMs: 50, includeTags: ['Demo'] },
      { logStorage, sessionManager },
    );

    feature.setup();
    await Promise.resolve();
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();

    expect(feature.getSnapshot()).toEqual([{
      id: '0', timestamp: 10, platform: 'android', level: 'info',
      source: 'logcat', tag: 'Demo', message: 'ready',
    }]);

    feature.cleanup();
    expect(NativeModules.DebugToolkitNativeLogs.stopCapture).toHaveBeenCalledTimes(1);
  });

  it('clears persisted native logs', async () => {
    const logStorage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(logStorage);
    const feature = createNativeLogsFeature({ pollIntervalMs: 50 }, { logStorage, sessionManager });

    feature.setup();
    await Promise.resolve();
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();

    feature.clear?.();
    expect(feature.getSnapshot()).toEqual([]);
  });
});
```

- [ ] **Step 6: Run failing feature tests**

```bash
npx jest src/__tests__/features/nativeLogs.test.ts --runInBand
```

Expected: FAIL — feature returns empty snapshot, does not poll.

- [ ] **Step 7: Implement NativeLogTab**

Create `src/features/nativeLogs/NativeLogTab.tsx`:

```tsx
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import { Colors } from '../../ui/theme/colors';
import { fmt } from '../../utils/copyToComputer';
import type { DebugFeatureRenderProps, NativeLogEntry } from '../../types';

const LEVEL_COLORS: Record<string, string> = {
  trace: '#8E8E93', debug: '#8E8E93', info: '#007AFF',
  warn: '#FF9500', error: '#FF3B30', fatal: '#AF52DE', unknown: '#8E8E93',
};

export const NativeLogTab: React.FC<DebugFeatureRenderProps<NativeLogEntry[]>> = React.memo(({ snapshot }) => (
  <LogListScreen
    data={snapshot}
    emptyText="No native logs"
    renderRow={(item) => (
      <View style={s.row}>
        <View style={[s.level, { backgroundColor: LEVEL_COLORS[item.level] ?? LEVEL_COLORS.unknown }]}>
          <Text style={s.levelText}>{item.level.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={s.content}>
          <Text style={s.message} numberOfLines={2}>{item.message}</Text>
          <Text style={s.meta}>
            {[item.platform, item.source, item.tag].filter(Boolean).join(' / ')} · {new Date(item.timestamp).toLocaleTimeString()}
          </Text>
        </View>
      </View>
    )}
    renderDetailHeader={(item) => (
      <>
        <View style={[s.badge, { backgroundColor: LEVEL_COLORS[item.level] ?? LEVEL_COLORS.unknown }]}>
          <Text style={s.badgeText}>{item.level.toUpperCase()}</Text>
        </View>
        <Text style={s.detailTime}>{new Date(item.timestamp).toLocaleString()}</Text>
      </>
    )}
    renderDetailBody={(item) => (
      <ScrollView style={s.detailBody} contentContainerStyle={s.detailContent}>
        <View style={s.copyRow}>
          <CopyButton text={fmt(item)} label="Native Log" />
        </View>
        <Text style={s.messageBlock} selectable>{item.message}</Text>
        <Text style={s.rawBlock} selectable>{fmt(item)}</Text>
      </ScrollView>
    )}
  />
));

const s = StyleSheet.create({
  row: { flexDirection: 'row', padding: 14, alignItems: 'flex-start' },
  level: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  levelText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  message: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  detailTime: { flex: 1, fontSize: 13, color: Colors.textSecondary, textAlign: 'right' },
  detailBody: { flex: 1 },
  detailContent: { padding: 12, gap: 12 },
  copyRow: { alignItems: 'flex-end' },
  messageBlock: { fontFamily: 'Courier', fontSize: 13, color: Colors.text, lineHeight: 20 },
  rawBlock: { fontFamily: 'Courier', fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});
```

- [ ] **Step 8: Implement JS feature**

Replace `src/features/nativeLogs/index.ts` with:

```ts
import { NativeLogTab } from './NativeLogTab';
import type { DebugFeature, DebugFeatureListener, NativeLogEntry } from '../../types';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { getDefaultLogRuntime, type LogRuntimeContext } from '../../utils/logRuntime';
import { drainNativeLogs, startNativeLogCapture, stopNativeLogCapture } from './nativeLogsBridge';

const DEFAULT_MAX_LOGS = 200;
const DEFAULT_MAX_PERSIST = 50;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_DRAIN_LIMIT = 100;

const LEVEL_RANK: Record<NativeLogEntry['level'], number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5, unknown: 0,
};

export interface NativeLogsFeatureConfig {
  maxLogs?: number;
  pollIntervalMs?: number;
  minLevel?: NativeLogEntry['level'];
  includeTags?: Array<string | RegExp>;
  excludeTags?: Array<string | RegExp>;
}

function matchesPattern(value: string | undefined, patterns: Array<string | RegExp> | undefined): boolean {
  if (!value || !patterns?.length) return false;
  return patterns.some((p) => p instanceof RegExp ? p.test(value) : value.includes(p));
}

function shouldKeepEntry(entry: Omit<NativeLogEntry, 'id'>, config?: NativeLogsFeatureConfig): boolean {
  if (config?.minLevel && LEVEL_RANK[entry.level] < LEVEL_RANK[config.minLevel]) return false;
  if (config?.includeTags?.length && !matchesPattern(entry.tag, config.includeTags)) return false;
  if (matchesPattern(entry.tag, config?.excludeTags)) return false;
  return true;
}

export const createNativeLogsFeature = (
  config?: NativeLogsFeatureConfig,
  runtime: LogRuntimeContext = getDefaultLogRuntime(),
): DebugFeature<NativeLogEntry[]> => {
  const maxLogs = config?.maxLogs ?? DEFAULT_MAX_LOGS;
  const pollIntervalMs = Math.max(100, Math.floor(config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS));
  const logStore = createPersistedObservableStore<NativeLogEntry>({
    storage: runtime.logStorage,
    storageKey: runtime.sessionManager.getLogStorageKey('native_logs'),
    maxPersist: DEFAULT_MAX_PERSIST,
  });

  let initialized = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let draining = false;

  async function drainOnce(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      const entries = await drainNativeLogs(DEFAULT_DRAIN_LIMIT);
      entries.filter((e) => shouldKeepEntry(e, config)).forEach((entry) => {
        logStore.push({ ...entry, id: logStore.nextId() }, maxLogs);
      });
    } finally { draining = false; }
  }

  return {
    name: 'native',
    label: 'Native',
    renderContent: NativeLogTab,
    setup: () => {
      if (initialized) return;
      initialized = true;
      startNativeLogCapture({
        minLevel: config?.minLevel,
        includeTags: config?.includeTags?.filter((p) => typeof p === 'string'),
        excludeTags: config?.excludeTags?.filter((p) => typeof p === 'string'),
      }).catch(() => {});
      timer = setInterval(() => { drainOnce().catch(() => {}); }, pollIntervalMs);
    },
    getSnapshot: () => logStore.getData(),
    clear: () => { logStore.clearPersisted(); },
    cleanup: () => {
      if (!initialized) return;
      if (timer) clearInterval(timer);
      timer = null;
      stopNativeLogCapture().catch(() => {});
      logStore.dispose();
      initialized = false;
      draining = false;
    },
    subscribe: (listener: DebugFeatureListener) => logStore.subscribe(listener),
  };
};

export function _resetNativeLogsForTesting(): void {
  stopNativeLogCapture().catch(() => {});
}
```

- [ ] **Step 9: Run feature tests**

```bash
npx jest src/__tests__/features/nativeLogsBridge.test.ts src/__tests__/features/nativeLogs.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/features/nativeLogs src/__tests__/features/nativeLogs.test.ts src/__tests__/features/nativeLogsBridge.test.ts
git commit -m "feat: add native logs js feature"
```

---

### Task 4: Implement Android Native Logcat Collector

**Files:** `android/.../DebugToolkitNativeLogsModule.java`, `android/.../ReactNativeDebugToolkitPackage.java`, `src/__tests__/features/nativeLogsSource.test.ts`

- [ ] **Step 1: Write Android source contract test**

Create `src/__tests__/features/nativeLogsSource.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('native logs source contracts', () => {
  it('exposes Android native logs module with current process logcat capture', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitNativeLogsModule.java'),
      'utf8',
    );
    expect(source).toContain('MODULE_NAME = "DebugToolkitNativeLogs"');
    expect(source).toContain('startCapture');
    expect(source).toContain('drainLogs');
    expect(source).toContain('stopCapture');
    expect(source).toContain('Process.myPid()');
    expect(source).toContain('logcat');
  });

  it('registers DevConnect and NativeLogs Android modules', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'android/src/main/java/com/reactnativedebugtoolkit/ReactNativeDebugToolkitPackage.java'),
      'utf8',
    );
    expect(source).toContain('new DebugToolkitDevConnectModule(reactContext)');
    expect(source).toContain('new DebugToolkitNativeLogsModule(reactContext)');
  });
});
```

- [ ] **Step 2: Run failing source test**

```bash
npx jest src/__tests__/features/nativeLogsSource.test.ts --runInBand
```

Expected: FAIL — Android module file missing.

- [ ] **Step 3: Create Android module**

Create `android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitNativeLogsModule.java`:

```java
package com.reactnativedebugtoolkit;

import android.os.Process;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DebugToolkitNativeLogsModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "DebugToolkitNativeLogs";
  private static final int MAX_BUFFER = 500;
  private static final Pattern THREADTIME = Pattern.compile(
      "^\\s*(\\d+-\\d+)\\s+(\\d+:\\d+:\\d+\\.\\d+)\\s+(\\d+)\\s+(\\d+)\\s+([VDIWEF])\\s+([^:]+):\\s?(.*)$");

  private final Object lock = new Object();
  private final ArrayDeque<WritableMap> buffer = new ArrayDeque<>();
  private java.lang.Process logcatProcess;
  private Thread readerThread;
  private boolean capturing = false;
  private String lastError = null;

  public DebugToolkitNativeLogsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() { return MODULE_NAME; }

  @ReactMethod
  public void startCapture(ReadableMap options, Promise promise) {
    synchronized (lock) {
      if (capturing) { promise.resolve(statusMap(true)); return; }
      capturing = true;
      lastError = null;
    }
    readerThread = new Thread(() -> readLogcat(), "DebugToolkitNativeLogs");
    readerThread.setDaemon(true);
    readerThread.start();
    promise.resolve(statusMap(true));
  }

  @ReactMethod
  public void stopCapture(Promise promise) {
    synchronized (lock) {
      capturing = false;
      if (logcatProcess != null) { logcatProcess.destroy(); logcatProcess = null; }
    }
    promise.resolve(statusMap(false));
  }

  @ReactMethod
  public void drainLogs(double max, Promise promise) {
    int limit = Math.max(1, (int) Math.floor(max));
    WritableArray drained = Arguments.createArray();
    synchronized (lock) {
      while (!buffer.isEmpty() && limit > 0) { drained.pushMap(buffer.removeFirst()); limit--; }
    }
    promise.resolve(drained);
  }

  @ReactMethod
  public void getStatus(Promise promise) {
    synchronized (lock) {
      WritableMap status = statusMap(capturing);
      if (lastError != null) status.putString("error", lastError);
      promise.resolve(status);
    }
  }

  private WritableMap statusMap(boolean isCapturing) {
    WritableMap map = Arguments.createMap();
    map.putBoolean("ok", true);
    map.putBoolean("available", true);
    map.putBoolean("capturing", isCapturing);
    return map;
  }

  private void readLogcat() {
    int pid = Process.myPid();
    try {
      ProcessBuilder builder = new ProcessBuilder("logcat", "-v", "threadtime", "--pid", String.valueOf(pid));
      logcatProcess = builder.redirectErrorStream(true).start();
      BufferedReader reader = new BufferedReader(new InputStreamReader(logcatProcess.getInputStream()));
      String line;
      while (isCapturing() && (line = reader.readLine()) != null) {
        WritableMap entry = parseLine(line, pid);
        if (entry != null) push(entry);
      }
    } catch (Exception error) {
      synchronized (lock) { lastError = error.getMessage(); }
    } finally {
      synchronized (lock) { capturing = false; logcatProcess = null; }
    }
  }

  private boolean isCapturing() { synchronized (lock) { return capturing; } }

  private void push(WritableMap entry) {
    synchronized (lock) {
      while (buffer.size() >= MAX_BUFFER) buffer.removeFirst();
      buffer.addLast(entry);
    }
  }

  private WritableMap parseLine(String line, int pid) {
    Matcher m = THREADTIME.matcher(line);
    if (!m.matches()) return null;
    if (Integer.parseInt(m.group(3)) != pid) return null;
    WritableMap entry = Arguments.createMap();
    entry.putDouble("timestamp", System.currentTimeMillis());
    entry.putString("platform", "android");
    entry.putString("source", "logcat");
    entry.putString("level", levelFromPriority(m.group(5)));
    entry.putString("thread", m.group(4));
    entry.putString("tag", m.group(6).trim());
    entry.putString("message", m.group(7));
    entry.putString("raw", line);
    return entry;
  }

  private String levelFromPriority(String priority) {
    String p = priority == null ? "" : priority.toUpperCase(Locale.US);
    switch (p) {
      case "V": return "trace";
      case "D": return "debug";
      case "I": return "info";
      case "W": return "warn";
      case "E": return "error";
      case "F": return "fatal";
      default: return "unknown";
    }
  }
}
```

- [ ] **Step 4: Register Android module**

In `android/.../ReactNativeDebugToolkitPackage.java`:

```java
import java.util.Arrays;
```

```java
return Arrays.<NativeModule>asList(
    new DebugToolkitDevConnectModule(reactContext),
    new DebugToolkitNativeLogsModule(reactContext));
```

- [ ] **Step 5: Run source test**

```bash
npx jest src/__tests__/features/nativeLogsSource.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitNativeLogsModule.java android/src/main/java/com/reactnativedebugtoolkit/ReactNativeDebugToolkitPackage.java src/__tests__/features/nativeLogsSource.test.ts
git commit -m "feat: capture android native logs"
```

---

### Task 5: Implement iOS RCTLog Collector

**Files:** `ios/DebugToolkitNativeLogs.mm`, `src/__tests__/features/nativeLogsSource.test.ts`

- [ ] **Step 1: Add iOS source contract test**

Add to `src/__tests__/features/nativeLogsSource.test.ts`:

```ts
it('exposes iOS native logs module through RCTAddLogFunction', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitNativeLogs.mm'), 'utf8');
  expect(source).toContain('RCT_EXPORT_MODULE(DebugToolkitNativeLogs)');
  expect(source).toContain('RCTAddLogFunction');
  expect(source).toContain('startCapture');
  expect(source).toContain('drainLogs');
  expect(source).toContain('stopCapture');
  expect(source).toContain('captureEnabled');
});
```

- [ ] **Step 2: Run failing source test**

```bash
npx jest src/__tests__/features/nativeLogsSource.test.ts --runInBand
```

Expected: FAIL — iOS module file missing.

- [ ] **Step 3: Create iOS module**

Create `ios/DebugToolkitNativeLogs.mm`:

```objc
#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTLog.h>

@interface DebugToolkitNativeLogs : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitNativeLogs

RCT_EXPORT_MODULE(DebugToolkitNativeLogs)

static const NSUInteger DebugToolkitNativeLogsMaxBuffer = 500;
static NSMutableArray<NSDictionary *> *buffer;
static dispatch_queue_t bufferQueue;
static BOOL captureEnabled = NO;
static BOOL logFunctionInstalled = NO;

+ (BOOL)requiresMainQueueSetup { return NO; }

+ (void)initialize {
  if (self == [DebugToolkitNativeLogs class]) {
    buffer = [NSMutableArray new];
    bufferQueue = dispatch_queue_create("com.reactnativedebugtoolkit.nativeLogs", DISPATCH_QUEUE_SERIAL);
  }
}

RCT_EXPORT_METHOD(startCapture:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  dispatch_sync(bufferQueue, ^{
    captureEnabled = YES;
    if (!logFunctionInstalled) {
      logFunctionInstalled = YES;
      RCTAddLogFunction(^(RCTLogLevel level, RCTLogSource source, NSString *fileName, NSNumber *lineNumber, NSString *message) {
        if (!captureEnabled || !message) return;
        NSDictionary *entry = @{
          @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000),
          @"platform": @"ios",
          @"source": @"rctLog",
          @"level": DebugToolkitNativeLogsLevel(level),
          @"message": message,
          @"file": fileName ?: @"",
          @"line": lineNumber ?: @0,
          @"raw": RCTFormatLog([NSDate date], level, fileName, lineNumber, message) ?: message
        };
        dispatch_async(bufferQueue, ^{
          if (buffer.count >= DebugToolkitNativeLogsMaxBuffer) [buffer removeObjectAtIndex:0];
          [buffer addObject:entry];
        });
      });
    }
  });
  resolve(@{@"ok": @YES, @"available": @YES, @"capturing": @YES});
}

RCT_EXPORT_METHOD(stopCapture:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  dispatch_sync(bufferQueue, ^{ captureEnabled = NO; });
  resolve(@{@"ok": @YES, @"available": @YES, @"capturing": @NO});
}

RCT_EXPORT_METHOD(drainLogs:(nonnull NSNumber *)max
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  __block NSArray<NSDictionary *> *drained = @[];
  NSUInteger limit = MAX((NSUInteger)1, max.unsignedIntegerValue);
  dispatch_sync(bufferQueue, ^{
    NSUInteger count = MIN(limit, buffer.count);
    drained = [buffer subarrayWithRange:NSMakeRange(0, count)];
    if (count > 0) [buffer removeObjectsInRange:NSMakeRange(0, count)];
  });
  resolve(drained);
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  __block BOOL current = NO;
  dispatch_sync(bufferQueue, ^{ current = captureEnabled; });
  resolve(@{@"available": @YES, @"capturing": @(current)});
}

static NSString *DebugToolkitNativeLogsLevel(RCTLogLevel level) {
  switch (level) {
    case RCTLogLevelTrace: return @"trace";
    case RCTLogLevelInfo: return @"info";
    case RCTLogLevelWarning: return @"warn";
    case RCTLogLevelError: return @"error";
    case RCTLogLevelFatal: return @"fatal";
  }
}

@end
```

- [ ] **Step 4: Run source test**

```bash
npx jest src/__tests__/features/nativeLogsSource.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Verify podspec**

```bash
pod ipc spec react-native-debug-toolkit.podspec >/tmp/react-native-debug-toolkit.podspec.json
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add ios/DebugToolkitNativeLogs.mm src/__tests__/features/nativeLogsSource.test.ts
git commit -m "feat: capture ios react native logs"
```

---

### Task 6: Add Daemon, Web Console, And MCP Native Log Support

**Files:** `node/mcp/src/logs.js`, `node/mcp/src/tools.js`, `node/mcp/__tests__/logs.test.js`, `node/daemon/src/console/console.html`, `node/daemon/__tests__/console.test.js`

- [ ] **Step 1: Write MCP native log test**

Add to `node/mcp/__tests__/logs.test.js`:

```js
test('selects native logs by type', () => {
  const payload = createToolPayload({
    deviceId: 'ios-1',
    receivedAt: '2026-06-02T00:00:00.000Z',
    lastSeenAt: '2026-06-02T00:00:00.000Z',
    report: {
      version: 2,
      logs: { native: [{ id: 'n1', timestamp: 1, level: 'error', source: 'rctLog', message: 'native failed' }] },
    },
  }, { logType: 'native' });

  expect(payload.logType).toBe('native');
  expect(payload.logs).toEqual([{ id: 'n1', timestamp: 1, level: 'error', source: 'rctLog', message: 'native failed' }]);
});
```

- [ ] **Step 2: Run failing MCP test**

```bash
npx jest node/mcp/__tests__/logs.test.js --runInBand
```

Expected: FAIL if `native` not in `KNOWN_LOG_TYPES`.

- [ ] **Step 3: Add native to MCP log types**

In `node/mcp/src/logs.js`:

```js
const KNOWN_LOG_TYPES = ['network', 'console', 'native', 'navigation', 'track', 'zustand'];
```

- [ ] **Step 4: Add Web Console native rendering**

In `node/daemon/src/console/console.html`:

`labelForType`: add `native: 'Native',`

`getLogType` before `action` fallback:
```js
if (entry.source === 'logcat' || entry.source === 'rctLog' || entry.platform === 'android' || entry.platform === 'ios') return 'native';
```

`summarize` before navigation fallback:
```js
if (entry.source === 'logcat' || entry.source === 'rctLog') {
  return escapeHtml([entry.tag, entry.message].filter(Boolean).join(': ').substring(0, 200));
}
```

Detail renderer near `renderConsoleDetails`:
```js
function renderNativeDetails(entry) {
  return renderSection('Native Log', renderRows([
    ['Level', entry.level], ['Platform', entry.platform], ['Source', entry.source],
    ['Tag', entry.tag], ['Thread', entry.thread], ['File', entry.file],
    ['Line', entry.line], ['Time', entry.timestamp ? formatTime(new Date(entry.timestamp).toISOString()) : ''],
  ])) +
  renderSection('Message', renderValue(entry.message || ''), entry.message || '') +
  (entry.raw ? renderSection('Raw', renderValue(entry.raw), entry.raw) : '') +
  renderSection('Entry JSON', renderValue(entry), entry);
}
```

`renderLogDetails`: add `if (logType === 'native') return renderNativeDetails(entry);`

CSS: add `.log-type-native{color:var(--amber)}`

- [ ] **Step 5: Add Web Console smoke test**

In `node/daemon/__tests__/console.test.js`:

```js
const fs = require('fs');
const path = require('path');

test('console html includes native log rendering support', async () => {
  const server = createServer({ token: '' });
  const html = fs.readFileSync(path.join(__dirname, '../src/console/console.html'), 'utf8');
  expect(html).toContain("native: 'Native'");
  expect(html).toContain('function renderNativeDetails');
  expect(html).toContain('log-type-native');
  await server.close();
});
```

- [ ] **Step 6: Run daemon and MCP tests**

```bash
npx jest node/mcp/__tests__/logs.test.js node/mcp/__tests__/server.test.js node/daemon/__tests__/console.test.js node/daemon/__tests__/server.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add node/mcp/src/logs.js node/mcp/src/tools.js node/mcp/__tests__/logs.test.js node/daemon/src/console/console.html node/daemon/__tests__/console.test.js
git commit -m "feat: surface native logs in desktop tools"
```

---

### Task 7: Document Native Logs And Release Opt-In

**Files:** `README.md`, `README.zh-CN.md`

- [ ] **Step 1: Update README feature list**

In `README.md`, update feature bullet:

```md
- In-app debug panel with Network, Console, Native, Navigation, Track, Zustand, Environment, and Clipboard logs.
```

Add section:

```md
### Native Logs

Native Logs collects native app-process logs and shows them in the `Native` tab.

- Android: captures current app-process `logcat` entries visible to the app.
- iOS: captures React Native native logs emitted through `RCTLog*`.
- DevConnect sends Native logs to the desktop daemon with the rest of the current session.

Release builds stay disabled by default. To use the toolkit in an internal release, TestFlight, QA, or gray rollout build, pass `enabled: true`:

```tsx
<DebugView enabled={true} />
```

`enabled: true` is the only release opt-in. Use it carefully because native logs can contain user data, tokens, URLs, or device state. Do not enable it by default in public production builds.
```

- [ ] **Step 2: Update Chinese README**

In `README.zh-CN.md`, add:

```md
### 原生日志

Native Logs 会收集当前 App 进程的原生日志，并显示在 `Native` 标签页。

- Android：收集当前 App 进程可见的 `logcat` 日志。
- iOS：收集 React Native 通过 `RCTLog*` 发出的原生日志。
- DevConnect 会把 Native 日志和当前 session 的其他日志一起同步到桌面 daemon。

Release 包默认仍关闭。内部 release、TestFlight、QA 或灰度排查需要开启时，只传 `enabled: true`：

```tsx
<DebugView enabled={true} />
```

`enabled: true` 是唯一的 release 开关。原生日志可能包含用户数据、token、URL 或设备状态，不要在公开生产包中默认开启。
```

- [ ] **Step 3: Verify**

```bash
rg -n "Native Logs|enabled=\\{true\\}|原生日志|enabled: true" README.md README.zh-CN.md
```

Expected: both files include Native Logs + `enabled: true` wording.

- [ ] **Step 4: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: document native logs"
```

---

### Task 8: Full Verification And Package Checks

- [ ] **Step 1: Run targeted Jest**

```bash
npx jest src/__tests__/core/initialize.test.ts src/__tests__/features/nativeLogsBridge.test.ts src/__tests__/features/nativeLogs.test.ts src/__tests__/features/nativeLogsSource.test.ts src/__tests__/features/sessionLogStorage.test.ts src/__tests__/utils/deviceReport.test.ts node/mcp/__tests__/logs.test.js node/mcp/__tests__/server.test.js node/daemon/__tests__/console.test.js node/daemon/__tests__/server.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Lint**

```bash
npm run lint
```

Expected: PASS (zero errors).

- [ ] **Step 5: Whitespace check**

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Podspec check**

```bash
pod ipc spec react-native-debug-toolkit.podspec >/tmp/react-native-debug-toolkit.podspec.json
```

Expected: exit 0.

- [ ] **Step 7: Package dry run**

```bash
npm pack --dry-run
```

Expected: tarball includes `ios/DebugToolkitNativeLogs.mm`, `android/.../DebugToolkitNativeLogsModule.java`, `src/features/nativeLogs`, `node/daemon`, `node/mcp`.

- [ ] **Step 8: Commit if verification required fixes** (skip if no changes)

```bash
git add README.md README.zh-CN.md src node android ios
git commit -m "test: verify native logs feature"
```

---

## Self-Review

- Spec coverage: feature registration, session persistence, Android collector, iOS `RCTLog` collector, in-app Native tab, daemon/Web Console/MCP, docs, `enabled: true` semantics, package verification.
- No placeholders, no second release switch, no global iOS interception, no all-device Android capture.
- Naming: feature=`native`, storage key=`native_logs`, native module=`DebugToolkitNativeLogs`, type=`NativeLogEntry`.
- Risk boundary: Android = app-visible logcat only. iOS = `RCTLog*` only. Both activate in release only via `enabled: true`.
