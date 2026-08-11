import { DebugToolkit } from '../../core/DebugToolkit';
import type { DebugFeatureListener } from '../../types';
import { createDefaultLogStorage } from '../../utils/StorageAdapter';
import { createQuickAccountsController } from './controller';
import { QuickAccountsTab } from './QuickAccountsTab';
import { getQuickAccountsLastUsedStorageKey } from './storage';
import type {
  CreateQuickAccountsFeatureOptions,
  QuickAccountItem,
  QuickAccountViewItem,
  QuickAccountsCopy,
  QuickAccountsFeature,
  QuickAccountsLastResult,
  QuickAccountsSnapshot,
  QuickAccountsState,
  QuickAccountsStorageKey,
  QuickAccountsViewState,
} from './types';

export const DEFAULT_QUICK_ACCOUNTS_COPY: QuickAccountsCopy = {
  tabLabel: 'Accounts',
  title: 'Quick Accounts',
  description: 'Switch to a configured debug account.',
  emptyTitle: 'No Accounts',
  emptyDescription: 'Pass accounts to use quick switching.',
  unauthenticatedTitle: 'Not Signed In',
  unauthenticatedDescription: 'Choose an account to sign in.',
  currentLabel: 'Current',
  lastUsedLabel: 'Recent',
  switchLabel: 'Switch',
  switchingLabel: 'Switching…',
  successMessage: 'Account switched.',
  errorMessage: 'Could not switch account.',
};

function projectAccount<TAccount extends QuickAccountItem>(
  account: TAccount,
): QuickAccountViewItem {
  return {
    id: account.id,
    label: account.label,
    subtitle: account.subtitle,
    note: account.note,
  };
}

function normalizeState<TAccount extends QuickAccountItem>(
  state: QuickAccountsState<TAccount>,
): Required<Pick<QuickAccountsState<TAccount>, 'accounts'>> &
  Omit<QuickAccountsState<TAccount>, 'accounts'> & {
    isAuthenticated: boolean;
    currentAccountId: string | null;
    currentAccountDetails: NonNullable<
      QuickAccountsState<TAccount>['currentAccountDetails']
    >;
  } {
  return {
    accounts: [...state.accounts],
    scopeKey: state.scopeKey || undefined,
    contextLabel: state.contextLabel || undefined,
    isAuthenticated:
      state.isAuthenticated ?? state.currentAccountId != null,
    currentAccountId: state.currentAccountId ?? null,
    currentAccountDetails: [...(state.currentAccountDetails ?? [])],
  };
}

function resolveStorageKey(
  storageKey: QuickAccountsStorageKey | undefined,
  scopeKey: string,
): string {
  if (typeof storageKey === 'function') {
    return storageKey(scopeKey);
  }
  if (storageKey) {
    return `${storageKey}:${scopeKey}`;
  }
  return getQuickAccountsLastUsedStorageKey(scopeKey);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
}

async function callBestEffort(callback: (() => void | Promise<void>) | undefined) {
  if (!callback) {
    return;
  }
  try {
    await callback();
  } catch {
    // Presentation callbacks must not change the account switch result.
  }
}

export function createQuickAccountsFeature<
  TAccount extends QuickAccountItem,
>(
  options: CreateQuickAccountsFeatureOptions<TAccount>,
): QuickAccountsFeature<TAccount> {
  const listeners = new Set<DebugFeatureListener>();
  const copy = { ...DEFAULT_QUICK_ACCOUNTS_COPY, ...options.copy };
  const closePanelOnSuccess = options.closePanelOnSuccess ?? true;
  let state = normalizeState<TAccount>(options);
  let lastUsedAccountId: string | null = null;
  let lastResult: QuickAccountsLastResult = 'idle';
  let currentErrorMessage: string | null = null;
  let storage = options.storage;
  let storageGeneration = 0;
  const storageTasks = new Set<Promise<void>>();
  let lifecycleAttached = false;
  let lifecycleBlocked = false;
  let manuallySuspended = options.initiallySuspended ?? false;

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Observers must not break switching or lifecycle operations.
      }
    });
  };

  const getStorage = () => {
    storage ??= createDefaultLogStorage();
    return storage;
  };

  const trackStorage = (task: Promise<unknown>): Promise<void> => {
    const tracked = task.then(
      () => undefined,
      () => undefined,
    );
    storageTasks.add(tracked);
    tracked.then(() => {
      storageTasks.delete(tracked);
    });
    return tracked;
  };

  const hydrate = () => {
    const requestGeneration = ++storageGeneration;
    const scopeKey = state.scopeKey;
    lastUsedAccountId = null;
    notify();
    if (!scopeKey) {
      return;
    }

    let storedValue: string | null | Promise<string | null>;
    try {
      const key = resolveStorageKey(options.storageKey, scopeKey);
      storedValue = getStorage().getItem(key);
    } catch {
      storedValue = null;
    }
    trackStorage(
      Promise.resolve(storedValue)
        .then((storedId) => {
          if (
            requestGeneration !== storageGeneration ||
            !lifecycleAttached
          ) {
            return;
          }
          lastUsedAccountId = state.accounts.some(
            (account) => account.id === storedId,
          )
            ? storedId
            : null;
          notify();
        }),
    );
  };

  const controller = createQuickAccountsController<TAccount>({
    onSwitch: options.onSwitch,
    onRollback: options.onRollback
      ? (account, context) =>
          options.onRollback?.(projectAccount(account), context)
      : undefined,
    onStateChange: notify,
  });

  if (manuallySuspended) {
    controller.suspend();
  }

  const getSnapshot = (): QuickAccountsSnapshot => {
    const controllerState = controller.getState();
    return {
      accountCount: state.accounts.length,
      busy: controllerState.busy,
      suspended: controllerState.suspended,
      lastResult,
    };
  };

  const getViewState = (): QuickAccountsViewState => {
    const controllerState = controller.getState();
    const projectedAccounts = state.accounts.map(projectAccount);
    const recentIndex = projectedAccounts.findIndex(
      (account) => account.id === lastUsedAccountId,
    );
    if (recentIndex > 0) {
      const [recent] = projectedAccounts.splice(recentIndex, 1);
      if (recent) {
        projectedAccounts.unshift(recent);
      }
    }

    return {
      accounts: projectedAccounts,
      scopeKey: state.scopeKey,
      contextLabel: state.contextLabel,
      isAuthenticated: state.isAuthenticated,
      currentAccountId: state.currentAccountId,
      currentAccountDetails: [...state.currentAccountDetails],
      lastUsedAccountId,
      busy: controllerState.busy,
      suspended: controllerState.suspended,
      lastResult,
      errorMessage: currentErrorMessage,
      copy,
    };
  };

  const switchAccount = async (accountId: string) => {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) {
      const error = new Error(`Quick account not found: ${accountId}`);
      lastResult = 'error';
      currentErrorMessage = error.message;
      notify();
      return { status: 'error' as const, error };
    }

    currentErrorMessage = null;
    notify();
    const requestScopeKey = state.scopeKey;
    const result = await controller.switchTo(account);
    lastResult = result.status;

    if (result.status === 'success') {
      if (state.scopeKey === requestScopeKey) {
        storageGeneration += 1;
        lastUsedAccountId = account.id;
        notify();

        if (requestScopeKey) {
          await trackStorage(
            Promise.resolve().then(() => {
              const key = resolveStorageKey(
                options.storageKey,
                requestScopeKey,
              );
              return getStorage().setItem(key, account.id);
            }),
          );
        }
      }

      await callBestEffort(() => options.onSuccess?.(projectAccount(account)));
      if (closePanelOnSuccess) {
        DebugToolkit.closePanel();
      }
    } else if (result.status === 'error') {
      currentErrorMessage = errorMessage(result.error, copy.errorMessage);
      await callBestEffort(() =>
        options.onError?.(result.error, projectAccount(account)),
      );
    }

    notify();
    return result;
  };

  return {
    name: 'quick-accounts',
    label: copy.tabLabel,
    renderContent: QuickAccountsTab,
    setup: () => {
      if (lifecycleAttached) {
        return;
      }
      lifecycleAttached = true;
      lifecycleBlocked = false;
      if (!manuallySuspended) {
        controller.resume();
      }
      hydrate();
    },
    cleanup: () => {
      lifecycleAttached = false;
      lifecycleBlocked = true;
      storageGeneration += 1;
      controller.suspend();
    },
    getSnapshot,
    getViewState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update: (nextState) => {
      const previousScopeKey = state.scopeKey;
      state = normalizeState(nextState);
      if (
        lastUsedAccountId &&
        !state.accounts.some((account) => account.id === lastUsedAccountId)
      ) {
        lastUsedAccountId = null;
      }
      if (previousScopeKey !== state.scopeKey) {
        if (lifecycleAttached) {
          hydrate();
        } else {
          lastUsedAccountId = null;
        }
      }
      notify();
    },
    switchAccount,
    suspend: () => {
      manuallySuspended = true;
      controller.suspend();
    },
    resume: () => {
      manuallySuspended = false;
      if (!lifecycleBlocked) {
        controller.resume();
      }
    },
    waitForIdle: () => controller.waitForIdle(),
    waitForStorage: async () => {
      while (storageTasks.size > 0) {
        await Promise.all([...storageTasks]);
      }
    },
  };
}
