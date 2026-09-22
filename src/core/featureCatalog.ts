export const FEATURE_KEYS = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
  'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type LogFeatureKey = Extract<FeatureKey,
  'network' | 'console' | 'native' | 'state' | 'navigation' | 'track'>;
