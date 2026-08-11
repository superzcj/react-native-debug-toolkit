import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { createQuickAccountsFeature } from '../../features/quickAccounts/createQuickAccountsFeature';
import { isQuickAccountSwitchDisabled } from '../../features/quickAccounts/QuickAccountsTab';

type PrivateAccount = {
  id: string;
  label: string;
  subtitle?: string;
  note?: string;
  secret: string;
};

const accountA: PrivateAccount = {
  id: 'a',
  label: 'Owner',
  subtitle: 'Primary test identity',
  secret: 'must-not-leak-a',
};

const accountB: PrivateAccount = {
  id: 'b',
  label: 'Guest',
  note: 'No vehicle',
  secret: 'must-not-leak-b',
};

describe('createQuickAccountsFeature', () => {
  it('uses the stable opt-in feature name', () => {
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch: jest.fn(async () => undefined),
    });

    expect(feature.name).toBe('quick-accounts');
  });

  it('keeps private account fields out of the daemon-facing snapshot', () => {
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch: jest.fn(async () => undefined),
    });

    expect(feature.getSnapshot()).toEqual({
      accountCount: 1,
      busy: false,
      suspended: false,
      lastResult: 'idle',
    });
    expect(JSON.stringify(feature.getSnapshot())).not.toContain(accountA.secret);
    expect(feature.getViewState().accounts).toEqual([
      {
        id: accountA.id,
        label: accountA.label,
        subtitle: accountA.subtitle,
        note: undefined,
      },
    ]);
    expect(JSON.stringify(feature.getViewState())).not.toContain(accountA.secret);
  });

  it('does not expose host error details in the snapshot', async () => {
    const privateError = new Error('token must-not-leak');
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch: async () => {
        throw privateError;
      },
    });

    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'error',
      error: privateError,
    });
    expect(feature.getSnapshot().lastResult).toBe('error');
    expect(JSON.stringify(feature.getSnapshot())).not.toContain(privateError.message);
  });

  it('passes the full private account only to the host callback', async () => {
    const onSwitch = jest.fn(async () => undefined);
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch,
    });

    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'success',
    });
    expect(onSwitch).toHaveBeenCalledWith(
      accountA,
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });

  it('projects accounts before presentation and rollback callbacks', async () => {
    const privateError = new Error('failed');
    const onRollback = jest.fn(async () => undefined);
    const onSuccess = jest.fn(async () => undefined);
    const onError = jest.fn(async () => undefined);
    const successFeature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch: jest.fn(async () => undefined),
      onSuccess,
    });
    const failureFeature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch: jest.fn(async () => {
        throw privateError;
      }),
      onRollback,
      onError,
    });

    await successFeature.switchAccount(accountA.id);
    await failureFeature.switchAccount(accountA.id);

    const publicAccount = {
      id: accountA.id,
      label: accountA.label,
      subtitle: accountA.subtitle,
      note: undefined,
    };
    expect(onSuccess).toHaveBeenCalledWith(publicAccount);
    expect(onRollback).toHaveBeenCalledWith(
      publicAccount,
      expect.objectContaining({ reason: 'error', error: privateError }),
    );
    expect(onError).toHaveBeenCalledWith(privateError, publicAccount);
    expect(failureFeature.getViewState().errorMessage).toBe(privateError.message);
    expect(JSON.stringify(onRollback.mock.calls)).not.toContain(accountA.secret);
  });

  it('orders the successful account first and persists it by scope', async () => {
    const storage = new MemoryStorageAdapter();
    const feature = createQuickAccountsFeature({
      accounts: [accountA, accountB],
      scopeKey: 'demo:test',
      storage,
      onSwitch: jest.fn(async () => undefined),
    });

    feature.setup();
    await feature.waitForStorage();
    await expect(feature.switchAccount(accountB.id)).resolves.toEqual({
      status: 'success',
    });

    expect(feature.getViewState().accounts.map((account) => account.id)).toEqual([
      accountB.id,
      accountA.id,
    ]);
    expect(storage.getItem('react-native-debug-toolkit.quick-accounts.last:demo:test'))
      .toBe(accountB.id);
  });

  it('keeps a successful switch successful when recent-account storage fails', async () => {
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      storage: {
        getItem: () => null,
        setItem: async () => {
          throw new Error('disk unavailable');
        },
        removeItem: () => undefined,
      },
      onSwitch: jest.fn(async () => undefined),
    });

    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'success',
    });
    expect(feature.getSnapshot().lastResult).toBe('success');
    expect(feature.getViewState().lastUsedAccountId).toBe(accountA.id);
  });

  it('treats a throwing custom storage key as a best-effort storage failure', async () => {
    const onSuccess = jest.fn(async () => undefined);
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      scopeKey: 'demo',
      storageKey: () => {
        throw new Error('invalid storage key');
      },
      onSwitch: jest.fn(async () => undefined),
      onSuccess,
    });

    expect(() => feature.setup()).not.toThrow();
    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'success',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('uses replacement state without replacing the feature object', async () => {
    const onSwitch = jest.fn(async () => undefined);
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      onSwitch,
    });
    const sameFeature = feature;

    feature.update({
      accounts: [accountB],
      currentAccountId: accountB.id,
    });
    await feature.switchAccount(accountB.id);

    expect(feature).toBe(sameFeature);
    expect(onSwitch).toHaveBeenCalledWith(
      accountB,
      expect.objectContaining({ signal: expect.any(Object) }),
    );
    expect(feature.getViewState().currentAccountId).toBe(accountB.id);
    expect(feature.getViewState().isAuthenticated).toBe(true);
  });

  it('allows the current account to be selected for a full re-login', () => {
    expect(isQuickAccountSwitchDisabled({
      busy: false,
      suspended: false,
    })).toBe(false);
  });

  it('clears omitted optional fields when replacing state', () => {
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      scopeKey: 'demo',
      contextLabel: 'Development',
      isAuthenticated: true,
      currentAccountId: accountA.id,
      currentAccountDetails: [{ label: 'Role', value: 'Owner' }],
      onSwitch: jest.fn(async () => undefined),
    });

    feature.update({ accounts: [accountB] });

    expect(feature.getViewState()).toEqual(expect.objectContaining({
      scopeKey: undefined,
      contextLabel: undefined,
      isAuthenticated: false,
      currentAccountId: null,
      currentAccountDetails: [],
    }));
  });

  it('ignores stale async storage reads after the scope changes', async () => {
    const resolvers = new Map<string, (value: string | null) => void>();
    const storage = {
      getItem: jest.fn(
        (key: string) => new Promise<string | null>((resolve) => resolvers.set(key, resolve)),
      ),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    };
    const feature = createQuickAccountsFeature({
      accounts: [accountA, accountB],
      scopeKey: 'one',
      storage,
      onSwitch: jest.fn(async () => undefined),
    });

    feature.setup();
    feature.update({ accounts: [accountA, accountB], scopeKey: 'two' });
    resolvers.get('react-native-debug-toolkit.quick-accounts.last:two')?.(accountB.id);
    await Promise.resolve();
    resolvers.get('react-native-debug-toolkit.quick-accounts.last:one')?.(accountA.id);
    await feature.waitForStorage();

    expect(feature.getViewState().lastUsedAccountId).toBe(accountB.id);
  });

  it('does not let same-scope hydration overwrite a newer successful switch', async () => {
    let resolveStored!: (value: string | null) => void;
    const storage = {
      getItem: jest.fn(
        () => new Promise<string | null>((resolve) => {
          resolveStored = resolve;
        }),
      ),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    };
    const feature = createQuickAccountsFeature({
      accounts: [accountA, accountB],
      scopeKey: 'same',
      storage,
      onSwitch: jest.fn(async () => undefined),
    });

    feature.setup();
    await feature.switchAccount(accountB.id);
    resolveStored(accountA.id);
    await feature.waitForStorage();

    expect(feature.getViewState().lastUsedAccountId).toBe(accountB.id);
  });

  it('does not write a completed switch into a newer scope', async () => {
    let finishSwitch: (() => void) | undefined;
    const storage = new MemoryStorageAdapter();
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      scopeKey: 'one',
      storage,
      onSwitch: () => new Promise<void>((resolve) => {
        finishSwitch = resolve;
      }),
    });

    const switching = feature.switchAccount(accountA.id);
    await Promise.resolve();
    feature.update({ accounts: [accountA], scopeKey: 'two' });
    finishSwitch?.();
    await expect(switching).resolves.toEqual({ status: 'success' });

    expect(feature.getViewState().lastUsedAccountId).toBeNull();
    expect(storage.getItem('react-native-debug-toolkit.quick-accounts.last:one'))
      .toBeNull();
    expect(storage.getItem('react-native-debug-toolkit.quick-accounts.last:two'))
      .toBeNull();
  });

  it('suspends during cleanup and resumes when the same feature is set up again', async () => {
    const onSwitch = jest.fn(async () => undefined);
    const feature = createQuickAccountsFeature({ accounts: [accountA], onSwitch });

    feature.cleanup();

    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'superseded',
    });
    expect(onSwitch).not.toHaveBeenCalled();
    expect(feature.getSnapshot().suspended).toBe(true);

    feature.setup();
    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'success',
    });
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('does not let setup override an explicit suspension', async () => {
    const onSwitch = jest.fn(async () => undefined);
    const feature = createQuickAccountsFeature({ accounts: [accountA], onSwitch });

    feature.suspend();
    feature.cleanup();
    feature.setup();

    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'superseded',
    });
    expect(onSwitch).not.toHaveBeenCalled();

    feature.resume();
    await expect(feature.switchAccount(accountA.id)).resolves.toEqual({
      status: 'success',
    });
  });

  it('supports custom copy and a scoped custom storage key', async () => {
    const storage = new MemoryStorageAdapter();
    const feature = createQuickAccountsFeature({
      accounts: [accountA],
      scopeKey: 'demo',
      storageKey: 'company.quick-accounts',
      storage,
      copy: { title: '快速账号' },
      onSwitch: jest.fn(async () => undefined),
    });

    await feature.switchAccount(accountA.id);

    expect(feature.getViewState().copy.title).toBe('快速账号');
    expect(feature.getViewState().copy.switchLabel).toBe('Switch');
    expect(storage.getItem('company.quick-accounts:demo')).toBe(accountA.id);
  });
});
