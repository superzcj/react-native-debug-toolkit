import type { ChannelFeatureKey } from '../core/featureCatalog';

export const SESSION_LOG_FEATURE_KEYS = [
  'console_logs',
  'network_logs',
  'native_logs',
  'track_logs',
] as const;

export type LogFeatureKey = typeof SESSION_LOG_FEATURE_KEYS[number] | ChannelFeatureKey;

export type LogCounts = Record<LogFeatureKey, number>;

export function createEmptyLogCounts(): LogCounts {
  return SESSION_LOG_FEATURE_KEYS.reduce<LogCounts>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as LogCounts);
}

export function countSessionLogs(counts: Partial<Record<LogFeatureKey, number>>): number {
  return Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
}
