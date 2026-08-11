import type { StorageAdapter } from '../../utils/StorageAdapter';
import type { DebugFeature, DebugFeatureListener } from '../../types';

export interface QuickAccountItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly note?: string;
}

export interface QuickAccountSwitchContext {
  readonly signal: AbortSignal;
}

export interface QuickAccountDetail {
  readonly label: string;
  readonly value: string;
}

export type QuickAccountRollbackReason = 'error' | 'superseded';

export interface QuickAccountRollbackContext {
  readonly reason: QuickAccountRollbackReason;
  readonly error?: unknown;
}

export type QuickAccountSwitchResult =
  | { readonly status: 'success' }
  | { readonly status: 'superseded' }
  | { readonly status: 'error'; readonly error: unknown };

export interface QuickAccountsControllerState {
  readonly busy: boolean;
  readonly suspended: boolean;
}

export interface QuickAccountsControllerOptions<
  TAccount extends QuickAccountItem,
> {
  readonly onSwitch: (
    account: TAccount,
    context: QuickAccountSwitchContext,
  ) => void | Promise<void>;
  readonly onRollback?: (
    account: TAccount,
    context: QuickAccountRollbackContext,
  ) => void | Promise<void>;
  readonly onStateChange?: (state: QuickAccountsControllerState) => void;
}

export interface QuickAccountsController<TAccount extends QuickAccountItem> {
  switchTo(account: TAccount): Promise<QuickAccountSwitchResult>;
  suspend(): void;
  resume(): void;
  waitForIdle(): Promise<void>;
  getState(): QuickAccountsControllerState;
}

export interface QuickAccountsStorageOptions {
  readonly storage: StorageAdapter;
  readonly scopeKey?: string;
}

export type QuickAccountsLastResult =
  | 'idle'
  | 'success'
  | 'error'
  | 'superseded';

export interface QuickAccountsSnapshot {
  readonly accountCount: number;
  readonly busy: boolean;
  readonly suspended: boolean;
  readonly lastResult: QuickAccountsLastResult;
}

export interface QuickAccountsCopy {
  readonly tabLabel: string;
  readonly title: string;
  readonly description: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly unauthenticatedTitle: string;
  readonly unauthenticatedDescription: string;
  readonly currentLabel: string;
  readonly lastUsedLabel: string;
  readonly switchLabel: string;
  readonly switchingLabel: string;
  readonly successMessage: string;
  readonly errorMessage: string;
}

export interface QuickAccountsState<TAccount extends QuickAccountItem> {
  readonly accounts: readonly TAccount[];
  readonly scopeKey?: string;
  readonly contextLabel?: string;
  readonly isAuthenticated?: boolean;
  readonly currentAccountId?: string | null;
  readonly currentAccountDetails?: readonly QuickAccountDetail[];
}

export interface QuickAccountViewItem extends QuickAccountItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string | undefined;
  readonly note: string | undefined;
}

export interface QuickAccountsViewState {
  readonly accounts: readonly QuickAccountViewItem[];
  readonly scopeKey: string | undefined;
  readonly contextLabel: string | undefined;
  readonly isAuthenticated: boolean;
  readonly currentAccountId: string | null;
  readonly currentAccountDetails: readonly QuickAccountDetail[];
  readonly lastUsedAccountId: string | null;
  readonly busy: boolean;
  readonly suspended: boolean;
  readonly lastResult: QuickAccountsLastResult;
  readonly errorMessage: string | null;
  readonly copy: QuickAccountsCopy;
}

export type QuickAccountsStorageKey =
  | string
  | ((scopeKey: string) => string);

export interface CreateQuickAccountsFeatureOptions<
  TAccount extends QuickAccountItem,
> extends QuickAccountsState<TAccount> {
  readonly onSwitch: (
    account: TAccount,
    context: QuickAccountSwitchContext,
  ) => void | Promise<void>;
  readonly onRollback?: (
    account: QuickAccountViewItem,
    context: QuickAccountRollbackContext,
  ) => void | Promise<void>;
  readonly onSuccess?: (
    account: QuickAccountViewItem,
  ) => void | Promise<void>;
  readonly onError?: (
    error: unknown,
    account: QuickAccountViewItem,
  ) => void | Promise<void>;
  readonly storage?: StorageAdapter;
  readonly storageKey?: QuickAccountsStorageKey;
  readonly copy?: Partial<QuickAccountsCopy>;
  readonly closePanelOnSuccess?: boolean;
  readonly initiallySuspended?: boolean;
}

export interface QuickAccountsFeature<TAccount extends QuickAccountItem>
  extends DebugFeature<QuickAccountsSnapshot> {
  update(state: QuickAccountsState<TAccount>): void;
  switchAccount(accountId: string): Promise<QuickAccountSwitchResult>;
  suspend(): void;
  resume(): void;
  waitForIdle(): Promise<void>;
  waitForStorage(): Promise<void>;
  getViewState(): QuickAccountsViewState;
  subscribe(listener: DebugFeatureListener): () => void;
}
