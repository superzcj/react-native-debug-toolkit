import type { DebugFeature, NativeLogEntry } from '../../types';

export interface NativeLogsFeatureConfig {
  maxLogs?: number;
  pollIntervalMs?: number;
  minLevel?: NativeLogEntry['level'];
  includeTags?: Array<string | RegExp>;
  excludeTags?: Array<string | RegExp>;
}

export const createNativeLogsFeature = (
  _config?: NativeLogsFeatureConfig,
): DebugFeature<NativeLogEntry[]> => ({
  name: 'native',
  label: 'Native',
  setup: () => {},
  getSnapshot: () => [],
  clear: () => {},
  cleanup: () => {},
});
