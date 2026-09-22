import type { DebugAccount } from '../../types/config';
import type {
  QuickAccountsController, QuickAccountsControllerOptions,
  QuickAccountsControllerState, QuickAccountSwitchResult, QuickAccountRollbackContext,
} from './types';

export type {
  QuickAccountItem, QuickAccountRollbackContext, QuickAccountRollbackReason,
  QuickAccountsController, QuickAccountsControllerOptions, QuickAccountsControllerState,
  QuickAccountSwitchContext, QuickAccountSwitchResult,
} from './types';

export function createQuickAccountsController<A extends DebugAccount>(
  options: QuickAccountsControllerOptions<A>,
): QuickAccountsController<A> {
  let generation = 0;
  let suspended = false;
  let busy = false;
  let active: AbortController | undefined;
  let tail: Promise<void> = Promise.resolve();
  const getState = (): QuickAccountsControllerState => ({ busy, suspended });
  const notify = () => {
    try { options.onStateChange?.(getState()); } catch { /* Observer isolation. */ }
  };
  const notificationError = (error: unknown, account: A) => {
    try { options.onNotificationError?.(error, account); } catch { /* Never recurse. */ }
  };
  const report = async (error: unknown, account: A) => {
    notificationError(error, account);
    try { await options.onError?.(error, account); }
    catch (callbackError) { notificationError(callbackError, account); }
  };
  const rollback = async (account: A, context: QuickAccountRollbackContext) => {
    try { await options.onRollback?.(account, context); }
    catch (error) { notificationError(error, account); }
  };
  const invalidate = () => { generation += 1; active?.abort(); };
  return {
    switchTo(account) {
      if (suspended) { return Promise.resolve({ status: 'disabled' }); }
      if (busy) { return Promise.resolve({ status: 'busy' }); }
      if (!options.onSwitch) { return Promise.resolve({ status: 'not_configured' }); }
      const token = ++generation;
      const abort = new AbortController();
      active = abort;
      busy = true;
      // Install the idle promise before notifying observers or calling business code.
      let finish!: () => void;
      tail = new Promise<void>(resolve => { finish = resolve; });
      notify();
      const valid = () => !suspended && token === generation && !abort.signal.aborted && (options.isCurrent?.(account) ?? true);
      const run = async (): Promise<QuickAccountSwitchResult> => {
        try {
          if (!valid()) { return { status: 'superseded' }; }
          try { await options.onSwitch!(account, { signal: abort.signal }); }
          catch (error) {
            const superseded = !valid();
            await rollback(account, { reason: superseded ? 'superseded' : 'error', error });
            if (superseded || !valid()) { return { status: 'superseded' }; }
            await report(error, account);
            return { status: 'error', error };
          }
          if (!valid()) {
            await rollback(account, { reason: 'superseded' });
            return { status: 'superseded' };
          }
          // Login is committed. Notification/persistence failures cannot roll it back.
          try { await options.onCommit?.(account); }
          catch (error) { await report(error, account); }
          return { status: 'success' };
        } finally {
          if (active === abort) { active = undefined; }
          busy = false;
          notify();
          finish();
        }
      };
      return run();
    },
    invalidate,
    suspend() {
      if (suspended) { return; }
      suspended = true;
      invalidate();
      notify();
    },
    resume() {
      if (!suspended) { return; }
      suspended = false;
      notify();
    },
    waitForIdle: () => tail,
    getState,
  };
}
