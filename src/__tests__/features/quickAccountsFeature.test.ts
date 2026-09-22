import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { createQuickAccountsFeature } from '../../features/quickAccounts/createQuickAccountsFeature';
import { isQuickAccountSwitchDisabled } from '../../features/quickAccounts/QuickAccountsTab';
import { normalizeConfig } from '../../core/config';
import type { AccountsSnapshot } from '../../types/config';
import type { FeatureStatus } from '../../types/debug';

const a = { id: 'a', title: 'Owner', secret: 'private-a' };
const b = { id: 'b', title: 'Guest', secret: 'private-b' };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
function runtime() {
  return { active: true, preferenceStorage: new MemoryStorageAdapter(), closePanel: jest.fn() };
}
function source(initial: AccountsSnapshot<typeof a>) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }),
    update(next: AccountsSnapshot<typeof a>) { value = next; listeners.forEach(listener => listener()); },
    get listenerCount() { return listeners.size; },
  };
}
function context() {
  const abort = new AbortController();
  const statuses: FeatureStatus[] = [];
  return { owner: Symbol(), signal: abort.signal, isCurrent: () => !abort.signal.aborted,
    setStatus: (status: FeatureStatus) => statuses.push(status), statuses, abort };
}
const flush = async () => { for (let i = 0; i < 8; i++) { await Promise.resolve(); } };
const phase = (ctx: ReturnType<typeof context>) => ctx.statuses[ctx.statuses.length - 1]?.phase;

describe('accounts configuration and presentation', () => {
  it.each([{}, { items: [] }, { onSwitch: jest.fn() }])('keeps empty supply inert: %p', async options => {
    const rt = runtime();
    rt.preferenceStorage.setItem('react-native-debug-toolkit.quick-accounts.last:default', 'a');
    const read = jest.spyOn(rt.preferenceStorage, 'getItem');
    const feature = createQuickAccountsFeature(options, rt);
    const ctx = context();
    await feature.start(ctx);
    expect(feature.getViewState().accounts).toEqual([]);
    expect(feature.getViewState().isAuthenticated).toBeUndefined();
    expect(feature.getViewState().lastUsedAccountId).toBeNull();
    expect(phase(ctx)).toBe('empty');
    expect(read).not.toHaveBeenCalled();
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'not_found' });
    expect(rt.closePanel).not.toHaveBeenCalled();
  });
  it('displays supplied accounts without a callback and does not persist or notify success', async () => {
    const rt = runtime();
    const onSuccess = jest.fn();
    const feature = createQuickAccountsFeature({ items: [a], onSuccess }, rt);
    await feature.start(context());
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'not_configured' });
    expect(feature.getViewState().switchConfigured).toBe(false);
    expect(isQuickAccountSwitchDisabled(feature.getViewState())).toBe(true);
    expect(rt.preferenceStorage.getItem('react-native-debug-toolkit.quick-accounts.last:default')).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(rt.closePanel).not.toHaveBeenCalled();
  });
  it('keeps private fields out of UI and telemetry and preserves unknown authentication', async () => {
    const account = { ...a, get password() { throw new Error('must not read'); } };
    const onSwitch = jest.fn();
    const onSuccess = jest.fn();
    const feature = createQuickAccountsFeature({ items: [account], currentId: 'a', onSwitch, onSuccess }, runtime());
    await feature.start(context());
    await feature.actions.switchTo('a');
    expect(onSwitch.mock.calls[0]?.[0]).toBe(account);
    expect(onSuccess.mock.calls[0]?.[0]).toBe(account);
    expect(feature.getViewState().isAuthenticated).toBeUndefined();
    expect(feature.getViewState().currentAccountDetails).toEqual([]);
    expect(JSON.stringify(feature.getSnapshot())).not.toContain(a.secret);
    expect(JSON.stringify(feature.getViewState())).not.toContain(a.secret);
  });
  it('passes original objects to rollback and error callbacks', async () => {
    const error = new Error('failed');
    const onRollback = jest.fn();
    const onError = jest.fn();
    const feature = createQuickAccountsFeature({ items: [a], onSwitch: () => { throw error; }, onRollback, onError }, runtime());
    await feature.start(context());
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'error', error });
    expect(onRollback).toHaveBeenCalledWith(a, { reason: 'error', error });
    expect(onError).toHaveBeenCalledWith(error, a);
  });
  it.each([
    { items: [{ id: '', title: 'A' }] }, { items: [{ id: 'a', title: '' }] },
    { items: [a, a] }, { source: source({ items: [] }), items: [] },
  ])('rejects malformed configuration: %p', async options => {
    expect(normalizeConfig({ accounts: options }).features.accounts.issues.length).toBeGreaterThan(0);
    const feature = createQuickAccountsFeature(options as never, runtime());
    const ctx = context();
    await feature.start(ctx);
    expect(phase(ctx)).toBe('error');
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'disabled' });
  });
});

describe('atomic account source and serialized switching', () => {
  it('authentication feedback does not abort a login and item identity is retained', async () => {
    const login = deferred();
    const data = source({ items: [a] });
    const rt = runtime();
    let signal!: AbortSignal;
    const onSuccess = jest.fn();
    const onRollback = jest.fn();
    const feature = createQuickAccountsFeature({ source: data, onSwitch: (_account, ctx) => { signal = ctx.signal; return login.promise; }, onSuccess, onRollback }, rt);
    const normalized = normalizeConfig({ accounts: { source: data } }).features.accounts.options;
    expect(normalized.items).toBeUndefined();
    expect(normalized.scopeKey).toBeUndefined();
    await feature.start(context());
    const switching = feature.actions.switchTo('a');
    data.update({ items: [a], currentId: 'a', isAuthenticated: true, currentDetails: [{ title: 'Role', value: 'Owner' }], contextLabel: 'Signed in' });
    expect(signal.aborted).toBe(false);
    login.resolve();
    await expect(switching).resolves.toEqual({ status: 'success' });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onRollback).not.toHaveBeenCalled();
    expect(rt.closePanel).toHaveBeenCalledTimes(1);
    expect(rt.preferenceStorage.getItem('react-native-debug-toolkit.quick-accounts.last:default')).toBe('a');
  });
  it.each(['replace', 'remove', 'scope', 'dispose'] as const)('cancels %s but remains busy through login and rollback', async change => {
    const login = deferred();
    const rollback = deferred();
    const rt = runtime();
    const data = source({ items: [a, b], scopeKey: 'one' });
    const onSwitch = jest.fn(() => login.promise);
    const onRollback = jest.fn(() => rollback.promise);
    const onSuccess = jest.fn();
    const feature = createQuickAccountsFeature({ source: data, onSwitch, onRollback, onSuccess }, rt);
    await feature.start(context());
    const switching = feature.actions.switchTo('a');
    if (change === 'dispose') { feature.dispose(); feature.actions.resume(); }
    else { data.update({ items: change === 'replace' ? [{ ...a }, b] : change === 'remove' ? [b] : [a, b], scopeKey: change === 'scope' ? 'two' : 'one' }); }
    await expect(feature.actions.switchTo('b')).resolves.toEqual({ status: change === 'dispose' ? 'disabled' : 'busy' });
    let idle = false;
    const waiting = feature.actions.waitForIdle().then(() => { idle = true; });
    await flush();
    expect(idle).toBe(false);
    login.resolve();
    await flush();
    expect(onRollback).toHaveBeenCalledWith(a, { reason: 'superseded' });
    expect(idle).toBe(false);
    expect(feature.getSnapshot().busy).toBe(true);
    rollback.resolve();
    await expect(switching).resolves.toEqual({ status: 'superseded' });
    await waiting;
    expect(feature.getSnapshot().busy).toBe(false);
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(rt.closePanel).not.toHaveBeenCalled();
    expect(rt.preferenceStorage.getItem('react-native-debug-toolkit.quick-accounts.last:one')).toBeNull();
    expect(rt.preferenceStorage.getItem('react-native-debug-toolkit.quick-accounts.last:two')).toBeNull();
    expect(feature.getViewState().lastUsedAccountId).toBeNull();
  });
  it('invalid dynamic snapshots cancel work and release the source', async () => {
    const login = deferred();
    const data = source({ items: [a] });
    const onRollback = jest.fn();
    const ctx = context();
    const feature = createQuickAccountsFeature({ source: data, onSwitch: () => login.promise, onRollback }, runtime());
    await feature.start(ctx);
    const switching = feature.actions.switchTo('a');
    data.update({ items: [a, a] });
    expect(data.listenerCount).toBe(0);
    expect(phase(ctx)).toBe('error');
    login.resolve();
    await expect(switching).resolves.toEqual({ status: 'superseded' });
    expect(onRollback).toHaveBeenCalledTimes(1);
  });
  it('resume cannot bypass unfinished cancelled work', async () => {
    const login = deferred();
    const feature = createQuickAccountsFeature({ items: [a, b], onSwitch: () => login.promise }, runtime());
    await feature.start(context());
    const first = feature.actions.switchTo('a');
    feature.actions.suspend();
    await expect(feature.actions.switchTo('missing')).resolves.toEqual({ status: 'disabled' });
    feature.actions.resume();
    await expect(feature.actions.switchTo('missing')).resolves.toEqual({ status: 'busy' });
    login.resolve();
    await expect(first).resolves.toEqual({ status: 'superseded' });
  });
  it('success notification failure preserves login and persistence without rollback', async () => {
    const error = new Error('notification failed');
    const rt = runtime();
    const onRollback = jest.fn();
    const onError = jest.fn();
    const feature = createQuickAccountsFeature({ items: [a], onSwitch: jest.fn(), onSuccess: () => { throw error; }, onRollback, onError }, rt);
    await feature.start(context());
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'success' });
    expect(onRollback).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(error, a);
    expect(feature.getViewState().errorMessage).toContain(error.message);
    expect(rt.preferenceStorage.getItem('react-native-debug-toolkit.quick-accounts.last:default')).toBe('a');
    expect(rt.closePanel).toHaveBeenCalledTimes(1);
  });
  it('contains rollback and error callback failures and eventually clears busy', async () => {
    const error = new Error('login failed');
    const onRollback = jest.fn(() => { throw new Error('rollback failed'); });
    const onError = jest.fn(() => { throw new Error('error callback failed'); });
    const feature = createQuickAccountsFeature({ items: [a], onSwitch: () => { throw error; }, onRollback, onError }, runtime());
    await feature.start(context());
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'error', error });
    await feature.actions.waitForIdle();
    expect(onRollback).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(feature.getViewState().errorMessage).toContain('rollback failed');
    expect(feature.getViewState().errorMessage).toContain('error callback failed');
    expect(feature.getSnapshot().busy).toBe(false);
  });
  it('waits for startup storage and ignores stale scope hydration', async () => {
    const rt = runtime();
    const reads = new Map<string, (value: string | null) => void>();
    const storage = { getItem: (key: string) => new Promise<string | null>(resolve => reads.set(key, resolve)), setItem: jest.fn(), removeItem: jest.fn() };
    const data = source({ items: [a, b], scopeKey: 'one' });
    const feature = createQuickAccountsFeature({ source: data }, { ...rt, preferenceStorage: storage });
    let started = false;
    const starting = Promise.resolve(feature.start(context())).then(() => { started = true; });
    await flush();
    expect(started).toBe(false);
    data.update({ items: [a, b], scopeKey: 'two' });
    reads.get('react-native-debug-toolkit.quick-accounts.last:two')?.('b');
    reads.get('react-native-debug-toolkit.quick-accounts.last:one')?.('a');
    await starting;
    await feature.waitForStorage();
    expect(feature.getViewState().lastUsedAccountId).toBe('b');
  });
  it('preference failure remains visible without rolling back login', async () => {
    const rt = runtime();
    jest.spyOn(rt.preferenceStorage, 'setItem').mockImplementation(() => { throw new Error('disk unavailable'); });
    const onRollback = jest.fn();
    const feature = createQuickAccountsFeature({ items: [a], onSwitch: jest.fn(), onRollback }, rt);
    await feature.start(context());
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'success' });
    expect(onRollback).not.toHaveBeenCalled();
    expect(feature.getViewState().errorMessage).toContain('disk unavailable');
  });
  it('does not initiate persistence or success notifications after a commit observer changes scope', async () => {
    const rt = runtime();
    const data = source({ items: [a], scopeKey: 'one' });
    const onSuccess = jest.fn();
    const feature = createQuickAccountsFeature({ source: data, onSwitch: jest.fn(), onSuccess }, rt);
    await feature.start(context());
    feature.subscribe(() => {
      if (feature.getSnapshot().lastResult === 'success') {
        data.update({ items: [a], scopeKey: 'two' });
      }
    });
    await feature.actions.switchTo('a');
    expect(rt.preferenceStorage.getItem('react-native-debug-toolkit.quick-accounts.last:one')).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(rt.closePanel).not.toHaveBeenCalled();
    expect(feature.getViewState().lastUsedAccountId).toBeNull();
  });
  it('late same-scope hydration cannot overwrite a newer successful ID', async () => {
    let resolveStored!: (value: string | null) => void;
    const rt = runtime();
    const storage = {
      getItem: () => new Promise<string | null>(resolve => { resolveStored = resolve; }),
      setItem: jest.fn(), removeItem: jest.fn(),
    };
    const feature = createQuickAccountsFeature({ items: [a, b], onSwitch: jest.fn() }, { ...rt, preferenceStorage: storage });
    const starting = feature.start(context());
    await feature.actions.switchTo('b');
    resolveStored('a');
    await starting;
    expect(feature.getViewState().lastUsedAccountId).toBe('b');
    expect(feature.getViewState().accounts[0]?.id).toBe('b');
  });
  it('aborting a host releases its source and settles startup despite pending preferences', async () => {
    const rt = runtime();
    const storage = { getItem: () => new Promise<string | null>(() => {}), setItem: jest.fn(), removeItem: jest.fn() };
    const data = source({ items: [a] });
    const feature = createQuickAccountsFeature({ source: data, onSwitch: jest.fn() }, { ...rt, preferenceStorage: storage });
    const ctx = context();
    const starting = feature.start(ctx);
    ctx.abort.abort();
    await starting;
    expect(data.listenerCount).toBe(0);
    await expect(feature.actions.switchTo('a')).resolves.toEqual({ status: 'disabled' });
  });
  it('late rollback failures cannot publish into a remounted host', async () => {
    const login = deferred();
    const feature = createQuickAccountsFeature({
      items: [a], onSwitch: () => login.promise,
      onRollback: () => { throw new Error('old host rollback failed'); },
    }, runtime());
    await feature.start(context());
    const old = feature.actions.switchTo('a');
    feature.dispose();
    await feature.start(context());
    login.resolve();
    await expect(old).resolves.toEqual({ status: 'superseded' });
    expect(feature.getViewState().errorMessage).toBeNull();
    expect(feature.getSnapshot().lastResult).toBe('idle');
    expect(feature.getStatus().phase).toBe('ready');
  });
});
