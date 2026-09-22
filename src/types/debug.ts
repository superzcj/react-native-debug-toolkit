import type { ConfigIssue } from '../core/config';
import type { FeatureKey } from '../core/featureCatalog';

export type AccountSwitchResult =
  | { readonly status: 'success' | 'superseded' | 'disabled' | 'busy' | 'not_configured' | 'not_found' }
  | { readonly status: 'error'; readonly error: unknown };

export interface AccountsActions {
  switchTo(id: string): Promise<AccountSwitchResult>;
  suspend(): void;
  resume(): void;
  waitForIdle(): Promise<void>;
}

export type FeaturePhase = 'initializing' | 'ready' | 'empty' | 'unavailable' | 'error';

export interface FeatureStatus {
  phase: FeaturePhase;
  issues: readonly ConfigIssue[];
}

export interface ReadyResult {
  status: 'ready' | 'partial' | 'disabled' | 'not_started' | 'cancelled' | 'initialization_timeout' | 'error';
  features: Partial<Record<FeatureKey, FeatureStatus>>;
  issues: readonly ConfigIssue[];
}
export type DeliveryStatus = 'success' | 'unavailable' | 'disabled' | 'error';
export interface CopyResult {
  status: 'completed' | 'disabled';
  phone: { status: DeliveryStatus; reason?: string };
  console: { status: DeliveryStatus; reason?: string };
  hub: { status: DeliveryStatus; reason?: string };
}
export type CopyAction = (text: string, options?: { label?: string }) => Promise<CopyResult>;
