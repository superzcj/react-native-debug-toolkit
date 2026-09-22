import { normalizeConfig } from '../../core/config';
import type { FeatureContext } from '../../core/runtimeTypes';
import type { AccountsOptions, AccountsSnapshot, DebugAccount } from '../../types/config';
import type { AccountsActions, AccountSwitchResult, FeatureStatus } from '../../types/debug';
import type { DebugFeatureListener } from '../../types/feature';
import { observeSource } from '../../utils/observeSource';
import { createQuickAccountsController } from './controller';
import { QuickAccountsTab } from './QuickAccountsTab';
import { t } from '../../i18n';
import { getQuickAccountsLastUsedStorageKey } from './storage';
import type {
  AccountsRuntimeContext, QuickAccountsCopy, QuickAccountsFeature,
  QuickAccountsLastResult, QuickAccountsViewState,
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

function getDefaultQuickAccountsCopy(): QuickAccountsCopy {
  return {
    tabLabel: t('quickAccounts.tab'),
    title: t('quickAccounts.title'),
    description: t('quickAccounts.description'),
    emptyTitle: t('quickAccounts.emptyTitle'),
    emptyDescription: t('quickAccounts.emptyDescription'),
    unauthenticatedTitle: t('quickAccounts.unauthenticatedTitle'),
    unauthenticatedDescription: t('quickAccounts.unauthenticatedDescription'),
    currentLabel: t('quickAccounts.current'),
    lastUsedLabel: t('quickAccounts.recent'),
    switchLabel: t('quickAccounts.switch'),
    switchingLabel: t('quickAccounts.switching'),
    successMessage: t('quickAccounts.success'),
    errorMessage: t('quickAccounts.error'),
  };
}


const DATA_FIELDS = ['items', 'currentId', 'scopeKey', 'contextLabel', 'isAuthenticated', 'currentDetails'];
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function readState<A extends DebugAccount>(input: unknown, dynamic = false): AccountsSnapshot<A> {
  if (dynamic && (typeof input !== 'object' || input === null || !Array.isArray((input as AccountsSnapshot<A>).items))) {
    throw new Error('accounts.source.items: Expected an account array.');
  }
  if (dynamic && Object.keys(input as object).some(key => !DATA_FIELDS.includes(key))) {
    throw new Error('accounts.source: Unexpected snapshot field.');
  }
  const parsed = normalizeConfig({ accounts: input }).features.accounts;
  if (parsed.issues.length) { throw new Error(parsed.issues.map(issue => issue.path + ': ' + issue.message).join('\n')); }
  const data = parsed.options;
  return {
    items: (data.items ?? []) as readonly A[],
    scopeKey: data.scopeKey as string ?? 'default',
    currentId: data.currentId as string | null | undefined,
    contextLabel: data.contextLabel as string | undefined,
    isAuthenticated: data.isAuthenticated as boolean | undefined,
    currentDetails: data.currentDetails === undefined ? undefined :
      (data.currentDetails as AccountsSnapshot<A>['currentDetails'])!.map(detail => ({ title: detail.title, value: detail.value })),
  };
}

export function createQuickAccountsFeature<A extends DebugAccount = DebugAccount>(
  options: AccountsOptions<A> = {},
  runtime: AccountsRuntimeContext,
): QuickAccountsFeature<A> {
  const parsed = normalizeConfig({ accounts: options }).features.accounts;
  let state: AccountsSnapshot<A> = { items: [], scopeKey: 'default' };
  let configError: unknown;
  try {
    if (parsed.issues.length) { throw new Error(parsed.issues.map(issue => issue.path + ': ' + issue.message).join('\n')); }
    if (!options.source) { state = readState<A>(options); }
  } catch (error) { configError = error; }
  const listeners = new Set<DebugFeatureListener>();
  let context: FeatureContext | undefined;
  let lifecycle: AbortController | undefined;
  let active = false;
  let manuallySuspended = false;
  let failed = false;
  let status: FeatureStatus = { phase: 'empty', issues: [] };
  let release: (() => void) | undefined;
  let lastUsedAccountId: string | null = null;
  let lastResult: QuickAccountsLastResult = 'idle';
  let errorMessage: string | null = null;
  let storageGeneration = 0;
  let hydration: { done: Promise<void>; finish(): void } | undefined;
  let request: { scope: string; target: A; lifecycle: AbortController | undefined } | undefined;
  const current = () => active && runtime.active && !!context && context.isCurrent() && !context.signal.aborted;
  const requestCurrent = (account: A) => current() && !failed && request?.lifecycle === lifecycle && request?.target === account &&
    request.scope === state.scopeKey && state.items.find(item => item.id === account.id) === account;
  const notify = () => { listeners.forEach(listener => { try { listener(); } catch { /* Observer isolation. */ } }); };
  const publish = () => {
    if (current()) { context!.setStatus(status); }
    notify();
  };
  const showError = (error: unknown, path = 'accounts') => {
    const text = message(error);
    errorMessage = errorMessage ? errorMessage + '\n' + text : text;
    status = { phase: 'error', issues: [...status.issues, { path, message: text }] };
    publish();
  };
  const publishData = () => {
    if (!failed && !errorMessage) { status = { phase: state.items.length ? 'ready' : 'empty', issues: [] }; }
    publish();
  };
  const invalidateHydration = () => {
    storageGeneration += 1;
    const previous = hydration;
    hydration = undefined;
    // Adapter promises need not cooperate with cancellation. Release SDK
    // waiters immediately while the generation guard discards late results.
    previous?.finish();
  };
  const hydrate = () => {
    invalidateHydration();
    const token = storageGeneration;
    const scope = state.scopeKey!;
    lastUsedAccountId = null;
    if (!current() || !state.items.length) { return; }
    let finish!: () => void;
    const pending = { done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() };
    hydration = pending;
    (async () => {
      try {
        const id = await runtime.preferenceStorage.getItem(getQuickAccountsLastUsedStorageKey(scope));
        if (token !== storageGeneration || !current()) { return; }
        lastUsedAccountId = state.items.some(account => account.id === id) ? id : null;
        notify();
      } catch (error) {
        if (token === storageGeneration && current()) { showError(error, 'accounts.preferences'); }
      } finally {
        if (hydration === pending) { hydration = undefined; }
        pending.finish();
      }
    })();
  };
  const controller = createQuickAccountsController<A>({
    onSwitch: options.onSwitch,
    onRollback: options.onRollback,
    isCurrent: requestCurrent,
    onStateChange: notify,
    onNotificationError: (error, account) => {
      if (requestCurrent(account)) { showError(error, 'accounts.callback'); }
    },
    onError: (error, account) => options.onError?.(error, account),
    onCommit: async account => {
      // The controller has just verified token, scope and target identity.
      const scope = request!.scope;
      lastUsedAccountId = account.id;
      lastResult = 'success';
      invalidateHydration();
      notify();
      if (!requestCurrent(account)) { return; }
      await (async () => {
        try { await runtime.preferenceStorage.setItem(getQuickAccountsLastUsedStorageKey(scope), account.id); }
        catch (error) { if (requestCurrent(account)) { showError(error, 'accounts.preferences'); } }
      })();
      if (!requestCurrent(account)) { return; }
      try { await options.onSuccess?.(account); }
      catch (error) {
        if (requestCurrent(account)) {
          showError(error, 'accounts.onSuccess');
          try { await options.onError?.(error, account); }
          catch (callbackError) { if (requestCurrent(account)) { showError(callbackError, 'accounts.onError'); } }
        }
      }
      if (requestCurrent(account) && options.closeOnSuccess !== false) { runtime.closePanel?.(); }
    },
  });
  const fail = (error: unknown) => {
    failed = true;
    controller.invalidate();
    release?.(); release = undefined;
    invalidateHydration();
    showError(error, 'accounts.source');
  };
  const update = (input: unknown, dynamic = false, initial = false) => {
    if (failed) { return; }
    try {
      const next = readState<A>(input, dynamic);
      const scopeChanged = state.scopeKey !== next.scopeKey;
      const previouslyEmpty = !state.items.length;
      if (scopeChanged || (request && next.items.find(item => item.id === request!.target.id) !== request.target)) {
        controller.invalidate();
      }
      state = next;
      if (scopeChanged) { errorMessage = null; lastResult = 'idle'; }
      if (!state.items.some(item => item.id === lastUsedAccountId)) { lastUsedAccountId = null; }
      if (initial || scopeChanged || (previouslyEmpty && state.items.length > 0) || !state.items.length) { hydrate(); }
      publishData();
    } catch (error) { fail(error); }
  };
  const switchTo = async (id: string): Promise<AccountSwitchResult> => {
    if (!current() || failed || controller.getState().suspended) { return { status: 'disabled' }; }
    if (controller.getState().busy) { return { status: 'busy' }; }
    const account = state.items.find(item => item.id === id);
    if (!account) { return { status: 'not_found' }; }
    if (!options.onSwitch) { return { status: 'not_configured' }; }
    request = { scope: state.scopeKey!, target: account, lifecycle };
    const operation = request;
    errorMessage = null;
    status = { phase: 'ready', issues: [] };
    lastResult = 'idle';
    const result = await controller.switchTo(account);
    if (request === operation && lifecycle === operation.lifecycle && current() && !failed && state.scopeKey === operation.scope) { lastResult = result.status; publish(); }
    if (request === operation) { request = undefined; }
    return result;
  };
  const suspend = () => { manuallySuspended = true; controller.suspend(); };
  const resume = () => { manuallySuspended = false; if (current() && !failed) { controller.resume(); } };
  const waitForStorage = async () => {
    const owner = lifecycle;
    while (owner === lifecycle && hydration) { await hydration.done; }
  };
  const actions: AccountsActions = { switchTo, suspend, resume, waitForIdle: () => controller.waitForIdle() };
  const dispose = () => {
    active = false;
    controller.suspend();
    invalidateHydration();
    context?.signal.removeEventListener('abort', dispose);
    lifecycle?.abort();
    release?.(); release = undefined;
    notify();
  };
  const start = async (ctx: FeatureContext) => {
    if (active) { return; }
    context = ctx;
    if (ctx.signal.aborted || !ctx.isCurrent() || !runtime.active) { return; }
    active = true;
    lifecycle = new AbortController();
    ctx.signal.addEventListener('abort', dispose, { once: true });
    if (!manuallySuspended) { controller.resume(); }
    failed = false;
    errorMessage = null;
    status = { phase: 'initializing', issues: [] };
    if (configError) { fail(configError); return; }
    if (options.source) {
      let initial = true;
      release = observeSource(options.source, {
        signal: lifecycle.signal,
        onSnapshot: value => {
          // Throw validation errors so observeSource also stops synchronous subscriptions.
          readState<A>(value, true);
          update(value, true, initial);
          initial = false;
        },
        onError: fail,
      });
    } else { hydrate(); }
    publishData();
    const signal = lifecycle.signal;
    let done!: () => void;
    const cancelled = new Promise<void>(resolve => { done = resolve; signal.addEventListener('abort', done, { once: true }); });
    if (signal.aborted) { done(); }
    await Promise.race([waitForStorage(), cancelled]);
    signal.removeEventListener('abort', done);
  };
  const getViewState = (): QuickAccountsViewState => {
    const accounts = state.items.map(account => ({ id: account.id, title: account.title, subtitle: account.subtitle, note: account.note }));
    const recentIndex = accounts.findIndex(account => account.id === lastUsedAccountId);
    if (recentIndex > 0) { accounts.unshift(accounts.splice(recentIndex, 1)[0]!); }
    return {
      accounts, scopeKey: state.scopeKey!, contextLabel: state.contextLabel,
      isAuthenticated: state.isAuthenticated, currentAccountId: state.currentId ?? null,
      currentAccountDetails: (state.currentDetails ?? []).map(detail => ({ ...detail })),
      lastUsedAccountId, ...controller.getState(), suspended: failed || !current() || controller.getState().suspended,
      switchConfigured: !!options.onSwitch,
      lastResult, errorMessage, copy: getDefaultQuickAccountsCopy(),
    };
  };
  return {
    name: 'accounts',
    get label() { return getDefaultQuickAccountsCopy().tabLabel; },
    renderContent: QuickAccountsTab, start, dispose, actions,
    setup: () => start({ owner: Symbol('accounts'), signal: new AbortController().signal, isCurrent: () => true, setStatus: () => undefined }),
    cleanup: dispose,
    update: input => update(input),
    switchAccount: switchTo, suspend, resume,
    waitForIdle: actions.waitForIdle, waitForStorage,
    getViewState, getStatus: () => status,
    getSnapshot: () => ({ accountCount: state.items.length, ...controller.getState(), lastResult }),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
