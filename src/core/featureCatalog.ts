import type { TranslationKey } from '../i18n';

export const FEATURE_KEYS = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
  'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs', 'viewInspector',
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
  viewInspector: 'View inspector',
};

export const FEATURE_LABEL_KEYS: Readonly<Record<BuiltinFeatureKey, TranslationKey>> = {
  network: 'feature.network', console: 'feature.console', native: 'feature.native', state: 'feature.state',
  navigation: 'feature.navigation', track: 'feature.track', connect: 'feature.connect', clipboard: 'feature.clipboard',
  history: 'feature.history', environment: 'feature.environment', accounts: 'feature.accounts', tabs: 'feature.tabs',
  viewInspector: 'viewInspector.title',
};

export const FEATURE_SHORT_LABEL_KEYS: Readonly<Record<BuiltinFeatureKey, TranslationKey>> = {
  network: 'feature.short.network', console: 'feature.short.console', native: 'feature.short.native', state: 'feature.short.state',
  navigation: 'feature.short.navigation', track: 'feature.short.track', connect: 'feature.short.connect', clipboard: 'feature.short.clipboard',
  history: 'feature.short.history', environment: 'feature.short.environment', accounts: 'feature.short.accounts', tabs: 'feature.short.tabs',
  viewInspector: 'viewInspector.short',
};

export const isChannelKey = (key: string): key is ChannelFeatureKey => /^channel\.[A-Za-z0-9_-]{1,40}$/.test(key);
export const isLogKey = (key: string): key is LogFeatureKey => isChannelKey(key) || (LOG_FEATURE_KEYS as readonly string[]).includes(key);
