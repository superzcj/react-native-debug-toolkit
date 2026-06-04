export const SESSION_LOG_FEATURE_KEYS = [
  'console_logs',
  'network_logs',
  'native_logs',
  'track_logs',
] as const;

export type LogFeatureKey = typeof SESSION_LOG_FEATURE_KEYS[number];

export type LogCounts = Record<LogFeatureKey, number>;

export function createEmptyLogCounts(): LogCounts {
  return SESSION_LOG_FEATURE_KEYS.reduce<LogCounts>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as LogCounts);
}

export function countSessionLogs(counts: Partial<Record<LogFeatureKey, number>>): number {
  return SESSION_LOG_FEATURE_KEYS.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}
