import { NativeModules } from 'react-native';
import { createToolkitHost } from '../../core/DebugToolkit';
import { claimHost } from '../../core/host';
import { debug } from '../../core/debug';
import { FEATURE_KEYS, LOG_FEATURE_KEYS } from '../../core/featureCatalog';
import { createDefaultLogStorage } from '../../utils/StorageAdapter';
import type { HubClient } from '../../utils/HubClient';
import type { DebugEnvironment } from '../../types/environment';

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
  await debug.environment.switchTo('staging');
  expect((await debug.copyToComputer('secret')).status).toBe('disabled');
  expect(NativeModules.DebugToolkitDevConnect.isDebugBuild).not.toHaveBeenCalled();
});

test('the public environment action drives selection, business callback, badge, and restore', async () => {
  const businessEnvironments: string[] = [];
  const host = mount({
    environment: {
      defaultId: 'dev',
      items: [
        { id: 'dev', title: 'Development', urls: { api: 'https://dev.test' } },
        { id: 'staging', title: 'Staging', urls: { api: 'https://staging.test' } },
      ],
      onChange: (environment: DebugEnvironment) => { businessEnvironments.push(environment.id); },
    },
  });
  await debug.ready();

  await debug.environment.switchTo('staging');
  const feature = host.features.find(item => item.name === 'environment')!;
  expect(feature.getSnapshot()).toMatchObject({ currentEnvironmentId: 'staging', busy: false, error: null });
  expect(feature.badge?.()).toEqual({ label: 'STA', color: '#FF9500' });
  expect(businessEnvironments).toEqual(['dev', 'staging']);

  await debug.environment.switchTo('dev');
  expect(feature.getSnapshot()).toMatchObject({ currentEnvironmentId: 'dev', busy: false, error: null });
  expect(businessEnvironments).toEqual(['dev', 'staging', 'dev']);
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

test('copy reports Hub success only after its console event is acknowledged', async () => {
  let finish!: (value: Response) => void;
  const fetch = jest.spyOn(global, 'fetch').mockImplementation(async url => String(url).endsWith('/events')
    ? new Promise<Response>(resolve => { finish = resolve; })
    : new Response(JSON.stringify({ ok: true, sessionId: 'copy-session', deviceId: 'device', expectedSequence: 1, ackThrough: 0 }), { status: 201 }));
  NativeModules.DebugToolkitDevConnect.isDebugBuild = async () => false;
  const host = mount({ enabled: true, connect: { appId: 'copy-app', endpoint: 'http://hub:3800' } });
  try {
    await debug.ready();
    const client: HubClient = host.features.find(feature => feature.name === 'connect')!.getSnapshot().client;
    client.connect({ live: true });
    for (let i = 0; i < 30; i++) { await Promise.resolve(); }
    expect(client.getStatus().state).toBe('connected');
    client.pauseSync(); debug.track('keep-this-log-paused');
    let completed = false;
    const copy = debug.copyToComputer('acknowledged copy', { label: 'Receipt' }).then(result => { completed = true; return result; });
    for (let i = 0; i < 30; i++) { await Promise.resolve(); }
    const eventCalls = fetch.mock.calls.filter(([url]) => String(url).endsWith('/events'));
    expect(eventCalls).toHaveLength(1);
    const request = fetch.mock.calls.find(([url]) => String(url).endsWith('/events'));
    const body = JSON.parse(String(request?.[1]?.body)) as { events: Array<{ sequence: number; type: string; data: { data: string[] } }> };
    expect(body.events).toEqual([expect.objectContaining({ type: 'console', data: expect.objectContaining({ data: ['Receipt', 'acknowledged copy'] }) })]);
    expect(completed).toBe(false);
    finish(new Response(JSON.stringify({ ok: true, ackThrough: body.events[0]!.sequence }), { status: 200 }));
    expect((await copy).hub.status).toBe('success');
    expect(debug.getReport().logs.console).toHaveLength(1);
    expect(debug.getReport().logs.track).toHaveLength(1);
    expect(client.isSyncPaused()).toBe(true);
  } finally { host.dispose(); fetch.mockRestore(); }
});

test('explicit per-feature false removes only that page and its actions', async () => {
  mount({ track: { enabled: false }, accounts: { enabled: false } });
  await debug.ready(); debug.track('ignored');
  expect(Object.keys(debug.getReport().features)).toHaveLength(10);
  expect(debug.getReport().logs.track).toBeUndefined();
  expect((await debug.accounts.switchTo('a')).status).toBe('disabled');
});
