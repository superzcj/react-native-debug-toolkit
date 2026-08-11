import {
  createQuickAccountsController,
  type QuickAccountItem,
} from '../../features/quickAccounts/controller';
import {
  getQuickAccountsLastUsedStorageKey,
  readLastUsedQuickAccountId,
  writeLastUsedQuickAccountId,
} from '../../features/quickAccounts/storage';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';

type PrivateAccount = QuickAccountItem & {
  secret: string;
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const accountA: PrivateAccount = {
  id: 'a',
  label: 'Account A',
  secret: 'private-a',
};

const accountB: PrivateAccount = {
  id: 'b',
  label: 'Account B',
  secret: 'private-b',
};

describe('createQuickAccountsController', () => {
  it('passes the full account and an abort signal to the host', async () => {
    const onSwitch = jest.fn(async () => undefined);
    const controller = createQuickAccountsController({ onSwitch });

    await expect(controller.switchTo(accountA)).resolves.toEqual({
      status: 'success',
    });
    expect(onSwitch).toHaveBeenCalledWith(
      accountA,
      expect.objectContaining({ signal: expect.any(Object) }),
    );
  });

  it('runs serially, aborts the active switch, and lets only the latest request win', async () => {
    const first = deferred();
    const events: string[] = [];
    let firstSignal: AbortSignal | undefined;
    const controller = createQuickAccountsController<PrivateAccount>({
      onSwitch: async (account, { signal }) => {
        events.push(`switch:${account.id}`);
        if (account.id === accountA.id) {
          firstSignal = signal;
          await first.promise;
        }
      },
      onRollback: async (account, { reason }) => {
        events.push(`rollback:${account.id}:${reason}`);
      },
    });

    const firstResult = controller.switchTo(accountA);
    await Promise.resolve();
    const secondResult = controller.switchTo(accountB);

    expect(firstSignal?.aborted).toBe(true);
    expect(events).toEqual(['switch:a']);
    first.resolve();

    await expect(firstResult).resolves.toEqual({ status: 'superseded' });
    await expect(secondResult).resolves.toEqual({ status: 'success' });
    expect(events).toEqual([
      'switch:a',
      'rollback:a:superseded',
      'switch:b',
    ]);
  });

  it('returns the original switch error when best-effort rollback also fails', async () => {
    const originalError = new Error('login failed');
    const controller = createQuickAccountsController({
      onSwitch: async () => {
        throw originalError;
      },
      onRollback: async () => {
        throw new Error('rollback failed');
      },
    });

    await expect(controller.switchTo(accountA)).resolves.toEqual({
      status: 'error',
      error: originalError,
    });
  });

  it('suspend aborts active work, rejects new work, and resume allows work again', async () => {
    const active = deferred();
    const signals: AbortSignal[] = [];
    const onSwitch = jest.fn(async (_account, { signal }) => {
      signals.push(signal);
      if (signals.length === 1) {
        await active.promise;
      }
    });
    const controller = createQuickAccountsController({ onSwitch });

    const inFlight = controller.switchTo(accountA);
    await Promise.resolve();
    controller.suspend();

    expect(controller.getState()).toEqual({ busy: true, suspended: true });
    expect(signals[0]?.aborted).toBe(true);
    await expect(controller.switchTo(accountB)).resolves.toEqual({
      status: 'superseded',
    });

    active.resolve();
    await expect(inFlight).resolves.toEqual({ status: 'superseded' });
    await controller.waitForIdle();
    expect(controller.getState()).toEqual({ busy: false, suspended: true });

    controller.resume();
    await expect(controller.switchTo(accountB)).resolves.toEqual({
      status: 'success',
    });
  });

  it('waitForIdle resolves only after suspended work has rolled back', async () => {
    const active = deferred();
    const rollback = deferred();
    const controller = createQuickAccountsController({
      onSwitch: async () => active.promise,
      onRollback: async () => rollback.promise,
    });
    const switching = controller.switchTo(accountA);
    await Promise.resolve();

    controller.suspend();
    active.resolve();
    let idle = false;
    const waiting = controller.waitForIdle().then(() => {
      idle = true;
    });
    await Promise.resolve();

    expect(idle).toBe(false);
    rollback.resolve();
    await waiting;
    await expect(switching).resolves.toEqual({ status: 'superseded' });
    expect(idle).toBe(true);
  });

  it('reports busy and suspended state changes without exposing errors', async () => {
    const active = deferred();
    const states: Array<{ busy: boolean; suspended: boolean }> = [];
    const controller = createQuickAccountsController({
      onSwitch: async () => active.promise,
      onStateChange: (state) => states.push(state),
    });

    const result = controller.switchTo(accountA);
    await Promise.resolve();
    controller.suspend();
    active.resolve();
    await result;

    expect(states).toEqual([
      { busy: true, suspended: false },
      { busy: true, suspended: true },
      { busy: false, suspended: true },
    ]);
  });
});

describe('quick account last-used storage', () => {
  it('scopes the key and round-trips an account id', async () => {
    const storage = new MemoryStorageAdapter();

    expect(getQuickAccountsLastUsedStorageKey('demo:test')).toBe(
      'react-native-debug-toolkit.quick-accounts.last:demo:test',
    );
    await writeLastUsedQuickAccountId(storage, 'demo:test', accountA.id);
    await expect(
      readLastUsedQuickAccountId(storage, 'demo:test'),
    ).resolves.toBe(accountA.id);
  });

  it('does not read or write when scope is empty', async () => {
    const storage = {
      getItem: jest.fn(() => accountA.id),
      setItem: jest.fn(() => undefined),
      removeItem: jest.fn(() => undefined),
    };

    await expect(readLastUsedQuickAccountId(storage, '')).resolves.toBeNull();
    await writeLastUsedQuickAccountId(storage, '', accountA.id);

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('lets write failures propagate so callers can choose best-effort behavior', async () => {
    const storageError = new Error('disk unavailable');
    const storage = {
      getItem: () => null,
      setItem: async () => {
        throw storageError;
      },
      removeItem: () => undefined,
    };

    await expect(
      writeLastUsedQuickAccountId(storage, 'demo:test', accountA.id),
    ).rejects.toBe(storageError);
  });
});
