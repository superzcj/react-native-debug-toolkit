import type { ComponentType } from 'react';

export type DebugFeatureListener = () => void;

export type BuiltInFeatureName =
  | 'network'
  | 'console'
  | 'zustand'
  | 'navigation'
  | 'track'
  | 'environment'
  | 'clipboard';

export interface DebugFeatureRenderProps<TSnapshot = unknown> {
  snapshot: TSnapshot;
  feature: DebugFeature<TSnapshot>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDebugFeature = DebugFeature<any>;

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
