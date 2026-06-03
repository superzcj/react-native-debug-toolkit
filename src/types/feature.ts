import type { ComponentType } from 'react';

export type DebugFeatureListener = () => void;

export type BuiltInFeatureName =
  | 'network'
  | 'console'
  | 'native'
  | 'zustand'
  | 'navigation'
  | 'track'
  | 'environment'
  | 'clipboard'
  | 'devConnect'
  | 'sessionHistory'
  | 'thirdPartyLibs';

export interface DebugFeatureRenderProps<TSnapshot = unknown> {
  snapshot: TSnapshot;
  feature: DebugFeature<TSnapshot>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDebugFeature = DebugFeature<any>;

/** Provides feature list and change notifications to consumers (e.g., DaemonClient). */
export interface FeatureDataProvider {
  readonly features: AnyDebugFeature[];
  subscribe(listener: DebugFeatureListener): () => void;
}

export interface DebugFeature<TSnapshot = unknown> {
  name: string;
  label: string;
  setup: () => void;
  getSnapshot: () => TSnapshot;
  clear?: () => void;
  cleanup: () => void;
  subscribe?: (listener: DebugFeatureListener) => () => void;
  renderContent?: ComponentType<DebugFeatureRenderProps<TSnapshot>>;
  badge?: () => { label: string; color: string } | null;
}
