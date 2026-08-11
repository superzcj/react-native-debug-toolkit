import type {
  QuickAccountItem,
  QuickAccountRollbackContext,
  QuickAccountsController,
  QuickAccountsControllerOptions,
  QuickAccountsControllerState,
  QuickAccountSwitchResult,
} from './types';

export type {
  QuickAccountItem,
  QuickAccountRollbackContext,
  QuickAccountRollbackReason,
  QuickAccountsController,
  QuickAccountsControllerOptions,
  QuickAccountsControllerState,
  QuickAccountSwitchContext,
  QuickAccountSwitchResult,
} from './types';

export function createQuickAccountsController<
  TAccount extends QuickAccountItem,
>(
  options: QuickAccountsControllerOptions<TAccount>,
): QuickAccountsController<TAccount> {
  let generation = 0;
  let suspended = false;
  let pendingCount = 0;
  let activeController: AbortController | null = null;
  let tail: Promise<void> = Promise.resolve();
  let lastState: QuickAccountsControllerState = {
    busy: false,
    suspended: false,
  };

  const getState = (): QuickAccountsControllerState => ({
    busy: pendingCount > 0,
    suspended,
  });

  const notifyStateChange = () => {
    const nextState = getState();
    if (
      nextState.busy === lastState.busy &&
      nextState.suspended === lastState.suspended
    ) {
      return;
    }

    lastState = nextState;
    try {
      options.onStateChange?.(nextState);
    } catch {
      // Observers must not break account switching.
    }
  };

  const isSuperseded = (requestGeneration: number, signal: AbortSignal) =>
    suspended || requestGeneration !== generation || signal.aborted;

  const rollback = async (
    account: TAccount,
    context: QuickAccountRollbackContext,
  ) => {
    try {
      await options.onRollback?.(account, context);
    } catch {
      // Preserve the original switch result when best-effort rollback fails.
    }
  };

  const switchTo = (
    account: TAccount,
  ): Promise<QuickAccountSwitchResult> => {
    if (suspended) {
      return Promise.resolve({ status: 'superseded' });
    }

    const requestGeneration = ++generation;
    activeController?.abort();
    pendingCount += 1;
    notifyStateChange();

    const run = async (): Promise<QuickAccountSwitchResult> => {
      if (suspended || requestGeneration !== generation) {
        return { status: 'superseded' };
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        await options.onSwitch(account, { signal: controller.signal });

        if (isSuperseded(requestGeneration, controller.signal)) {
          await rollback(account, { reason: 'superseded' });
          return { status: 'superseded' };
        }

        return { status: 'success' };
      } catch (error) {
        const superseded = isSuperseded(
          requestGeneration,
          controller.signal,
        );
        await rollback(account, {
          reason: superseded ? 'superseded' : 'error',
          error,
        });

        if (
          superseded ||
          isSuperseded(requestGeneration, controller.signal)
        ) {
          return { status: 'superseded' };
        }
        return { status: 'error', error };
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
      }
    };

    const result = tail.then(run, run).then((switchResult) => {
      pendingCount -= 1;
      notifyStateChange();
      return switchResult;
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    switchTo,
    suspend: () => {
      if (suspended) {
        return;
      }
      suspended = true;
      generation += 1;
      activeController?.abort();
      notifyStateChange();
    },
    resume: () => {
      if (!suspended) {
        return;
      }
      suspended = false;
      notifyStateChange();
    },
    waitForIdle: () => tail,
    getState,
  };
}
