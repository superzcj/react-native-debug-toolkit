import type { ComponentType } from 'react';
import type { FeatureStatus } from './debug';

export type FeatureConfig<T extends object> = T & { enabled?: boolean };

export type DebugFeatureListener = () => void;

export interface DebugFeatureRenderProps<TSnapshot = unknown> {
  snapshot: TSnapshot;
  feature: DebugFeature<TSnapshot>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDebugFeature = DebugFeature<any>;

/** Provides feature list and change notifications to consumers (e.g., HubClient). */
export interface FeatureDataProvider {
  readonly features: AnyDebugFeature[];
  subscribe(listener: DebugFeatureListener): () => void;
}

export interface DebugFeature<TSnapshot = unknown> {
  readonly status: FeatureStatus;
  name: string;
  label: string;
  setup: () => void | Promise<void>;
  getSnapshot: () => TSnapshot;
  clear?: () => void;
  cleanup: () => void;
  subscribe?: (listener: DebugFeatureListener) => () => void;
  renderContent?: ComponentType<DebugFeatureRenderProps<TSnapshot>>;
  badge?: () => { label: string; color: string } | null;
}
