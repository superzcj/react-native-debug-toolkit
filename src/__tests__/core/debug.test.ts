import { NativeModules } from 'react-native';
import { createToolkitHost } from '../../core/DebugToolkit';
import { claimHost } from '../../core/host';
import { debug } from '../../core/debug';
import { FEATURE_KEYS, LOG_FEATURE_KEYS } from '../../core/featureCatalog';
import { createDefaultLogStorage } from '../../utils/StorageAdapter';

let release: (() => void) | undefined;
beforeEach(() => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: jest.fn(async () => true) };
});
afterEach(() => { release?.(); release = undefined; });
function mount(config?: Parameters<typeof createToolkitHost>[0]) {
  const host = createToolkitHost(config);
  release = claimHost(Symbol('test-host'), host).release;
  host.start();
  return host;
}

test('the unmounted facade never creates channels or storage', async () => {
  expect((await debug.ready()).status).toBe('not_started');
  debug.track('early'); debug.state('store', { action: 'early', before: null, after: null }); debug.navigation({ action: 'early', to: 'Home' });
  debug.clear(); debug.open(); debug.close();
  expect(debug.getReport()).toEqual({ status: 'not_started', features: {}, logs: {} });
  expect((await debug.accounts.switchTo('a')).status).toBe('disabled');
  expect((await debug.copyToComputer('secret')).status).toBe('disabled');
  expect(NativeModules.DebugToolkitDevConnect.isDebugBuild).not.toHaveBeenCalled();
});

test('global false keeps all actions inert including report and copy', async () => {
  const disk = createDefaultLogStorage();
  const read = jest.spyOn(disk, 'getItem');
  const write = jest.spyOn(disk, 'setItem');
  try {
    const host = mount({ enabled: false });
    expect((await debug.ready()).status).toBe('disabled');
    debug.track('disabled'); debug.clear(); debug.open();
    expect(debug.getReport()).toEqual({ status: 'disabled', features: {}, logs: {} });
    expect(host.getSnapshot().panelOpen).toBe(false);
    expect((await debug.copyToComputer('secret')).status).toBe('disabled');
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
    expect(NativeModules.DebugToolkitDevConnect.isDebugBuild).not.toHaveBeenCalled();
  } finally { read.mockRestore(); write.mockRestore(); }
});

test('default registration preserves every page and records only after readiness', async () => {
  mount();
  debug.track('early');
  await debug.ready();
  expect(Object.keys(debug.getReport().features)).toEqual(FEATURE_KEYS);
  expect(debug.getReport().logs.track).toEqual([]);
  debug.track('purchase', { amount: 5 });
  debug.state('cart', { action: 'add', before: 0, after: 1 });
  debug.navigation({ action: 'navigate', to: 'Cart' });
  expect(debug.getReport().logs.track).toEqual([expect.objectContaining({ eventName: 'purchase', data: { amount: 5 } })]);
  expect(debug.getReport().logs.state).toEqual([expect.objectContaining({ storeId: 'cart', action: 'add' })]);
  expect(debug.getReport().logs.navigation).toHaveLength(1);
  debug.clear('track');
  expect(debug.getReport().logs.track).toEqual([]);
  expect(debug.getReport().logs.state).toHaveLength(1);
  debug.clear();
  for (const key of LOG_FEATURE_KEYS) { expect(debug.getReport().logs[key]).toEqual([]); }
});

test('clear leaves environment, account preferences and custom clear actions untouched', async () => {
  const onChange = jest.fn();
  const onClear = jest.fn();
  const host = mount({
    environment: { items: [{ id: 'dev', title: 'Dev', urls: { api: 'https://dev.test' } }], onChange },
    accounts: { items: [{ id: 'a', title: 'A' }] },
    tabs: { items: [{ id: 'test-tab', title: 'Test', component: () => null, onClear }] },
  });
  await debug.ready();
  const before = host.features.find(feature => feature.name === 'environment')!.getSnapshot();
  onChange.mockClear();
  debug.clear();
  expect(host.features.find(feature => feature.name === 'environment')!.getSnapshot()).toEqual(before);
  expect(onChange).not.toHaveBeenCalled(); expect(onClear).not.toHaveBeenCalled();
  expect((await debug.accounts.switchTo('a')).status).toBe('not_configured');
});

test('copy records in the owning console and reports an unconfirmed Hub honestly', async () => {
  mount(); await debug.ready();
  const result = await debug.copyToComputer('copied text', { label: 'Payload' });
  expect(result.console.status).toBe('success');
  expect(result.hub.status).toBe('unavailable');
  expect(debug.getReport().logs.console).toEqual([expect.objectContaining({ data: ['Payload', 'copied text'] })]);
});

test('explicit per-feature false removes only that page and its actions', async () => {
  mount({ track: { enabled: false }, accounts: { enabled: false } });
  await debug.ready(); debug.track('ignored');
  expect(Object.keys(debug.getReport().features)).toHaveLength(10);
  expect(debug.getReport().logs.track).toBeUndefined();
  expect((await debug.accounts.switchTo('a')).status).toBe('disabled');
});
