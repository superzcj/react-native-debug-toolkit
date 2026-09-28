import { configureLocale, getLocale } from '../../i18n';
import { NativeModules } from 'react-native';
import { createDefaultLogStorage } from '../../utils/StorageAdapter';
import { FEATURE_KEYS } from '../../core/featureCatalog';
import { getPreference } from '../../utils/debugPreferences';

const diagnostics = jest.spyOn(console, 'error').mockImplementation(() => {});
const { createToolkitHost } = require('../../core/DebugToolkit') as typeof import('../../core/DebugToolkit');

const hosts: ReturnType<typeof createToolkitHost>[] = [];
function host(config?: Parameters<typeof createToolkitHost>[0]) {
  const value = createToolkitHost(config); hosts.push(value); return value;
}
beforeEach(() => { diagnostics.mockClear(); NativeModules.DebugToolkitDevConnect = { isDebugBuild: jest.fn(async () => true) }; });
afterEach(() => { hosts.splice(0).forEach(value => value.dispose()); jest.useRealTimers(); });
afterAll(() => { diagnostics.mockRestore(); });

test('constructing the host is pure and disposing it before start is cancelled', async () => {
  const value = host();
  expect(NativeModules.DebugToolkitDevConnect.isDebugBuild).not.toHaveBeenCalled();
  expect(value.features).toEqual([]);
  expect((await value.ready).status).toBe('not_started');
  value.dispose(); value.start();
  expect((await value.ready).status).toBe('cancelled');
});

test('panel open, close and subscriptions are idempotent and owner-scoped', async () => {
  const value = host(); value.start(); await value.ready;
  const listener = jest.fn(); const unsubscribe = value.subscribe(listener);
  value.actions.open(); value.actions.open();
  expect(value.getSnapshot().panelOpen).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  value.actions.close(); value.actions.close();
  expect(value.getSnapshot().panelOpen).toBe(false);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe(); value.dispose();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(value.getSnapshot().features).toEqual([]);
});

test('actions-only configuration publishes quick actions without creating feature pages', async () => {
  const onPress = jest.fn();
  const disabledFeatures = Object.fromEntries(FEATURE_KEYS.map((key) => [key, { enabled: false }]));
  const value = host({
    enabled: true,
    ...disabledFeatures,
    quickActions: { items: [{ id: 'refresh', title: 'Refresh', onPress }] },
  });
  value.start();
  expect((await value.ready).status).toBe('ready');
  expect(value.features).toEqual([]);
  expect(value.getSnapshot().quickActions).toEqual([
    expect.objectContaining({ id: 'refresh', closeOnPress: true }),
  ]);
});

test('configuration errors keep their page while the other eleven start', async () => {
  const value = host({ network: { maxLogs: 0 } }); value.start();
  expect((await value.ready).status).toBe('partial');
  expect(value.features.map(feature => feature.name)).toEqual(FEATURE_KEYS);
  expect(value.features[0]!.status).toEqual({ phase: 'error', issues: [expect.objectContaining({ path: 'network.maxLogs' })] });
  value.actions.track('still-works');
  expect(value.actions.getReport().logs.track).toHaveLength(1);
});

test('invalid top-level input initializes no storage and leaves no pages', async () => {
  const disk = createDefaultLogStorage(); const read = jest.spyOn(disk, 'getItem');
  try {
    const value = host({ locale: 'invalid' } as never); value.start();
    expect((await value.ready).status).toBe('error');
    expect(value.features).toEqual([]); expect(read).not.toHaveBeenCalled();
    expect(diagnostics).toHaveBeenCalledWith('[DebugToolkit] Invalid configuration:', expect.arrayContaining([expect.objectContaining({ path: 'locale' })]));
  } finally { read.mockRestore(); }
});

test('panel preferences are bound while local history initialization is still pending', async () => {
  const disk = createDefaultLogStorage();
  let finish!: (value: string | null) => void;
  const read = jest.spyOn(disk, 'getItem').mockImplementation(key => key.endsWith('/sessions')
    ? new Promise(resolve => { finish = resolve; }) : 'saved-tab');
  try {
    const value = host(); value.start();
    for (let i = 0; i < 10; i++) { await Promise.resolve(); }
    expect(await getPreference('panel-tab')).toBe('saved-tab');
    value.dispose(); finish(null);
    expect((await value.ready).status).toBe('cancelled');
  } finally { read.mockRestore(); }
});

test('a pending native startup holds ready and cancels without leaking capture', async () => {
  let finish!: (value: { ok: boolean }) => void;
  const stop = jest.fn(async () => undefined);
  NativeModules.DebugToolkitNativeLogs = { startCapture: jest.fn(() => new Promise(resolve => { finish = resolve; })), stopCapture: stop, drainLogs: async () => [] };
  try {
    const value = host(); value.start();
    for (let i = 0; i < 30; i++) { await Promise.resolve(); }
    let settled = false; const ready = value.ready.then(result => { settled = true; return result; });
    await Promise.resolve(); expect(settled).toBe(false);
    value.dispose(); expect((await ready).status).toBe('cancelled');
    finish({ ok: true });
    for (let i = 0; i < 10; i++) { await Promise.resolve(); }
    expect(stop).toHaveBeenCalled();
  } finally { delete NativeModules.DebugToolkitNativeLogs; }
});

test('a ten-second detection timeout discards late startup and a new host can initialize', async () => {
  jest.useFakeTimers();
  let finish!: (value: boolean) => void;
  NativeModules.DebugToolkitDevConnect.isDebugBuild = () => new Promise(resolve => { finish = resolve; });
  const first = host(); first.start();
  await jest.advanceTimersByTimeAsync(10_000);
  expect((await first.ready).status).toBe('initialization_timeout');
  first.dispose();
  NativeModules.DebugToolkitDevConnect.isDebugBuild = async () => true;
  const replacement = host(); replacement.start(); await replacement.ready;
  finish(true); await Promise.resolve();
  expect(first.features).toEqual([]);
  expect(replacement.features).toHaveLength(12);
});

test('local release opt-in and unknown builds never discover or upload automatically', async () => {
  const previousFetch = global.fetch;
  const fetch = jest.fn(); global.fetch = fetch;
  try {
    NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => false, getAppInfo: async () => ({ nativeApplicationId: 'com.release' }) };
    const release = host({ enabled: true }); release.start(); await release.ready;
    expect(release.features).toHaveLength(12); expect(fetch).not.toHaveBeenCalled(); release.dispose();
    delete NativeModules.DebugToolkitDevConnect;
    const unknown = host({ enabled: true }); unknown.start(); await unknown.ready;
    expect(fetch).not.toHaveBeenCalled();
  } finally { global.fetch = previousFetch; }
});

test('actions-only hosts apply their explicit locale without starting feature services', async () => {
  configureLocale('en');
  const value = host({
    enabled: true, locale: 'zh-CN',
    ...Object.fromEntries(FEATURE_KEYS.map(key => [key, { enabled: false }])),
    quickActions: { items: [{ id: 'run', title: '执行', onPress: () => {} }] },
  });
  value.start();
  await value.ready;
  expect(getLocale()).toBe('zh-CN');
  value.dispose();
  configureLocale('en');
});
