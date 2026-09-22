export const FEATURE_KEYS = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
  'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type LogFeatureKey = Extract<FeatureKey,
  'network' | 'console' | 'native' | 'state' | 'navigation' | 'track'>;

export const LOG_FEATURE_KEYS: readonly LogFeatureKey[] = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
];

export const FEATURE_LABELS: Readonly<Record<FeatureKey, string>> = {
  network: 'Network', console: 'Console', native: 'Native', state: 'State',
  navigation: 'Navigation', track: 'Track', connect: 'Connect', clipboard: 'Clipboard',
  history: 'History', environment: 'Environment', accounts: 'Accounts', tabs: 'Custom',
};
