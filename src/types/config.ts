import type { ComponentType } from 'react';
import type { EnvironmentOptions } from './environment';
import type { FeatureConfig } from './feature';
import type { NativeLogLevel } from './logs';
import type { DebugNavigationRef } from './navigation';
import type { DebugSource, StateAdapter } from './source';

export interface DebugAccount {
  id: string;
  title: string;
  subtitle?: string;
  note?: string;
}

export interface AccountsSnapshot<A extends DebugAccount = DebugAccount> {
  items: readonly A[];
  currentId?: string | null;
  scopeKey?: string;
  contextLabel?: string;
  isAuthenticated?: boolean;
  currentDetails?: readonly { title: string; value: string }[];
}

export type AccountsData<A extends DebugAccount> =
  | (Partial<AccountsSnapshot<A>> & { source?: never })
  | ({ source: DebugSource<AccountsSnapshot<A>> } & {
      [K in keyof AccountsSnapshot<A>]?: never;
    });

export type AccountsOptions<A extends DebugAccount> = AccountsData<A> & {
  onSwitch?(account: A, context: { signal: AbortSignal }): void | Promise<void>;
  onRollback?(account: A, context: { reason: 'error' | 'superseded'; error?: unknown }): void | Promise<void>;
  onSuccess?(account: A): void | Promise<void>;
  onError?(error: unknown, account: A): void | Promise<void>;
  closeOnSuccess?: boolean;
};

export type DebugTab<S = never> = { id: string } & FeatureConfig<{
  title: string;
  onActivate?(): void;
  onDeactivate?(): void;
  onClear?(): void;
} & (
  | { source?: never; component: ComponentType<{}>; badge?(): { label: string; color: string } | null }
  | { source: DebugSource<S>; component: ComponentType<{ snapshot: S }>; badge?(snapshot: S): { label: string; color: string } | null }
)>;

export interface DebugToolkitConfig<
  A extends DebugAccount = DebugAccount,
  S extends readonly unknown[] = readonly never[],
> {
  enabled?: boolean;
  locale?: 'en' | 'zh-CN';
  network?: FeatureConfig<{ maxLogs?: number; excludeUrls?: readonly (string | RegExp)[] }>;
  console?: FeatureConfig<{ maxLogs?: number }>;
  native?: FeatureConfig<{
    maxLogs?: number;
    minLevel?: NativeLogLevel;
    includeTags?: readonly string[];
    excludeTags?: readonly string[];
    pollIntervalMs?: number;
  }>;
  state?: FeatureConfig<{ maxLogs?: number; adapters?: readonly StateAdapter[] }>;
  navigation?: FeatureConfig<{ maxLogs?: number; ref?: { current: DebugNavigationRef | null } }>;
  track?: FeatureConfig<{ maxLogs?: number }>;
  connect?: FeatureConfig<{ appId?: string; endpoint?: string }>;
  clipboard?: FeatureConfig<{}>;
  history?: FeatureConfig<{ maxSessions?: number }>;
  environment?: EnvironmentOptions;
  accounts?: FeatureConfig<AccountsOptions<A>>;
  tabs?: FeatureConfig<{ items?: { readonly [K in keyof S]: DebugTab<S[K]> } }>;
}
