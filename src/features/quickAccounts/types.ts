import type { StorageAdapter } from '../../utils/StorageAdapter';
import type { DebugFeature, DebugFeatureListener } from '../../types/feature';
import type { AccountsOptions, AccountsSnapshot, DebugAccount } from '../../types/config';
import type { AccountsActions, AccountSwitchResult, FeatureStatus } from '../../types/debug';
import type { FeatureDriver } from '../../core/runtimeTypes';

// Internal names retained until the public entry cutover.
export interface QuickAccountItem extends DebugAccount {}
export type QuickAccountSwitchResult = AccountSwitchResult;
export type QuickAccountSwitchContext = { readonly signal: AbortSignal };
export type QuickAccountDetail = { readonly title: string; readonly value: string };
export type QuickAccountRollbackReason = 'error' | 'superseded';
export type QuickAccountRollbackContext = { readonly reason: QuickAccountRollbackReason; readonly error?: unknown };
export interface QuickAccountsControllerState { readonly busy: boolean; readonly suspended: boolean }
export interface QuickAccountsControllerOptions<A extends DebugAccount> {
  readonly onSwitch?: AccountsOptions<A>['onSwitch'];
  readonly onRollback?: AccountsOptions<A>['onRollback'];
  readonly onError?: AccountsOptions<A>['onError'];
  readonly onNotificationError?: (error: unknown, account: A) => void;
  readonly onCommit?: (account: A) => void | Promise<void>;
  readonly isCurrent?: (account: A) => boolean;
  readonly onStateChange?: (state: QuickAccountsControllerState) => void;
}
export interface QuickAccountsController<A extends DebugAccount> {
  switchTo(account: A): Promise<AccountSwitchResult>;
  invalidate(): void;
  suspend(): void;
  resume(): void;
  waitForIdle(): Promise<void>;
  getState(): QuickAccountsControllerState;
}
export type QuickAccountsLastResult = 'idle' | AccountSwitchResult['status'];
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
export type QuickAccountsState<A extends DebugAccount> = Partial<AccountsSnapshot<A>>;
export interface QuickAccountViewItem extends DebugAccount {}
export interface QuickAccountsViewState {
  readonly accounts: readonly QuickAccountViewItem[];
  readonly scopeKey: string;
  readonly contextLabel: string | undefined;
  readonly isAuthenticated: boolean | undefined;
  readonly currentAccountId: string | null;
  readonly currentAccountDetails: readonly QuickAccountDetail[];
  readonly lastUsedAccountId: string | null;
  readonly switchConfigured: boolean;
  readonly busy: boolean;
  readonly suspended: boolean;
  readonly lastResult: QuickAccountsLastResult;
  readonly errorMessage: string | null;
  readonly copy: QuickAccountsCopy;
}
export type QuickAccountsStorageKey = string | ((scopeKey: string) => string);
export type CreateQuickAccountsFeatureOptions<A extends DebugAccount> = AccountsOptions<A>;
export interface AccountsRuntimeContext {
  readonly preferenceStorage: StorageAdapter;
  readonly active: boolean;
  closePanel?(): void;
}
export interface QuickAccountsFeature<A extends DebugAccount>
  extends DebugFeature<QuickAccountsSnapshot>, FeatureDriver {
  readonly actions: AccountsActions;
  update(state: QuickAccountsState<A>): void;
  switchAccount(id: string): Promise<AccountSwitchResult>;
  suspend(): void;
  resume(): void;
  waitForIdle(): Promise<void>;
  waitForStorage(): Promise<void>;
  getViewState(): QuickAccountsViewState;
  getStatus(): FeatureStatus;
  subscribe(listener: DebugFeatureListener): () => void;
}
