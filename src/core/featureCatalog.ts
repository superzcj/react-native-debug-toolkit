export const FEATURE_KEYS = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
  'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs',
] as const;

export type BuiltinFeatureKey = (typeof FEATURE_KEYS)[number];
export type ChannelFeatureKey = `channel.${string}`;
export type FeatureKey = BuiltinFeatureKey | ChannelFeatureKey;
export type LogFeatureKey = Extract<FeatureKey,
  'network' | 'console' | 'native' | 'state' | 'navigation' | 'track'> | ChannelFeatureKey;

export const LOG_FEATURE_KEYS: readonly LogFeatureKey[] = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
];

export const FEATURE_LABELS: Readonly<Record<BuiltinFeatureKey, string>> = {
  network: 'Network', console: 'Console', native: 'Native', state: 'State',
  navigation: 'Navigation', track: 'Track', connect: 'Connect', clipboard: 'Clipboard',
  history: 'History', environment: 'Environment', accounts: 'Accounts', tabs: 'Custom',
};

export const isChannelKey = (key: string): key is ChannelFeatureKey => /^channel\.[A-Za-z0-9_-]{1,40}$/.test(key);
export const isLogKey = (key: string): key is LogFeatureKey => isChannelKey(key) || (LOG_FEATURE_KEYS as readonly string[]).includes(key);
