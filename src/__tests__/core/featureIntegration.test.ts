import { NativeModules } from 'react-native';
import { createToolkitHost } from '../../core/DebugToolkit';
import type { AccountsSnapshot } from '../../types/config';
import { getPreference, bindPreferenceStorage } from '../../utils/debugPreferences';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import * as publicApi from '../../index';

beforeEach(() => { NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true }; });

test('the main entry exposes exactly one wrapper and one action facade at runtime', () => {
  expect(Object.keys(publicApi).sort()).toEqual(['debug', 'withDebugToolkit']);
});

test('account source changes use the current raw account and release the subscription with its host', async () => {
  const first = { id: 'a', title: 'First', token: 'first-secret' };
  const second = { id: 'b', title: 'Second', token: 'second-secret' };
  let snapshot: AccountsSnapshot<typeof first> = { items: [first] };
  let notify!: () => void;
  const unsubscribe = jest.fn();
  const source = { getSnapshot: () => snapshot, subscribe: jest.fn((listener: () => void) => { notify = listener; return unsubscribe; }) };
  const onSwitch = jest.fn();
  const host = createToolkitHost({ accounts: { source, onSwitch } });
  const abandoned = createToolkitHost({ accounts: { source, onSwitch: () => { throw new Error('abandoned'); } } });
  expect(source.subscribe).not.toHaveBeenCalled();
  try {
    host.start(); await host.ready;
    snapshot = { items: [second] }; notify();
    expect((await host.actions.accounts.switchTo('a')).status).toBe('not_found');
    expect((await host.actions.accounts.switchTo('b')).status).toBe('success');
    expect(onSwitch).toHaveBeenCalledWith(second, expect.objectContaining({ signal: expect.any(Object) }));
    expect(source.subscribe).toHaveBeenCalledTimes(1);
  } finally { host.dispose(); abandoned.dispose(); }
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('custom activation and source lifecycle belong to the host while snapshot updates stay live', async () => {
  let value = { count: 2 };
  let notify!: () => void;
  const deactivate = jest.fn(); const activate = jest.fn(); const release = jest.fn();
  const host = createToolkitHost({ tabs: { items: [{ id: 'stats', title: 'Stats', component: () => null,
    onActivate: activate, onDeactivate: deactivate, badge: (snapshot: { count: number }) => ({ label: String(snapshot.count), color: 'red' }),
    source: { getSnapshot: () => value, subscribe: (listener: () => void) => { notify = listener; return release; } },
  }] } });
  try {
    host.start(); await host.ready;
    expect(activate).toHaveBeenCalledTimes(1);
    value = { count: 3 }; notify();
    const tabs = host.features.find(feature => feature.name === 'tabs')!;
    expect(tabs.getSnapshot().items[0]).toMatchObject({ snapshot: { count: 3 }, badge: { label: '3', color: 'red' } });
    host.actions.open(); host.actions.close();
    expect(deactivate).not.toHaveBeenCalled();
  } finally { host.dispose(); }
  expect(deactivate).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
});

test('an old preference lease cannot disconnect a replacement lease', async () => {
  const first = new MemoryStorageAdapter(); first.setItem('tab', 'first');
  const second = new MemoryStorageAdapter(); second.setItem('tab', 'second');
  const releaseFirst = bindPreferenceStorage(first);
  const releaseSecond = bindPreferenceStorage(second);
  releaseFirst();
  expect(await getPreference('tab')).toBe('second');
  releaseSecond();
  expect(await getPreference('tab')).toBeNull();
});
