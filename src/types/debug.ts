import type { ConfigIssue } from '../core/config';
import type { FeatureKey } from '../core/featureCatalog';

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
