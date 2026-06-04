import { Colors } from '../../ui/theme/colors';
import {
  SESSION_LOG_FEATURE_KEYS,
  countSessionLogs,
  createEmptyLogCounts,
  type LogCounts,
  type LogFeatureKey,
} from '../../utils/sessionLogKeys';

export { countSessionLogs, createEmptyLogCounts };
export type { LogCounts, LogFeatureKey };

export const SESSION_HISTORY_LOG_KEYS = SESSION_LOG_FEATURE_KEYS;

export const SESSION_LOG_LABELS: Record<LogFeatureKey, string> = {
  console_logs: 'Console',
  network_logs: 'Network',
  native_logs: 'Native',
  track_logs: 'Track',
};

export const SESSION_LOG_COLORS: Record<LogFeatureKey, string> = {
  console_logs: Colors.info,
  network_logs: Colors.success,
  native_logs: '#FF9500',
  track_logs: Colors.primary,
};

export type DetailFilter = 'all' | LogFeatureKey;

export interface FlatSessionLogEntry {
  id: string;
  type: LogFeatureKey;
  timestamp: number;
  raw: unknown;
}

export function flattenSessionLogs(
  logs: Partial<Record<LogFeatureKey, unknown[]>>,
  filter: DetailFilter,
): FlatSessionLogEntry[] {
  const keys: readonly LogFeatureKey[] = filter === 'all'
    ? SESSION_HISTORY_LOG_KEYS
    : [filter];
  const entries: FlatSessionLogEntry[] = [];

  for (const key of keys) {
    const items = logs[key] ?? [];
    items.forEach((raw, index) => {
      const entry = raw as Record<string, unknown>;
      entries.push({
        id: `${key}-${index}`,
        type: key,
        timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : 0,
        raw,
      });
    });
  }

  entries.sort((left, right) => right.timestamp - left.timestamp);
  return entries;
}
