import { sanitizeDebugLogEntry } from '../../utils/deviceReport';
import { TrackLogTab } from './TrackLogTab';
import type { DebugFeature, TrackLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createChannelFeature } from '../../utils/createChannelFeature';
import { persistedLogLimit, type LogRuntimeContext } from '../../utils/logRuntime';

export interface TrackEventData {
  eventName: string;
  [key: string]: unknown;
}

type TrackLogPayload = TrackEventData & { timestamp: number };

let trackChannel = createEventChannel<TrackLogPayload>();

export const addTrackLog = (eventData: TrackEventData): void => {
  const snapshot = sanitizeDebugLogEntry(eventData) as TrackEventData;
  trackChannel.emit({ timestamp: Date.now(), ...snapshot });
};

export interface TrackFeatureConfig {
  /** Maximum number of track events to keep (default: 200) */
  maxLogs?: number;
}

export const createTrackFeature = (
  config: TrackFeatureConfig | undefined,
  runtime: LogRuntimeContext,
): DebugFeature<TrackLogEntry[]> =>
  createChannelFeature(
    () => trackChannel,
    (payload, id) => ({ ...payload, id }),
    {
      name: 'track',
      label: 'Track',
      renderContent: TrackLogTab,
      maxLogs: config?.maxLogs,
      persist: {
        storage: runtime.logStorage,
        storageKey: runtime.sessionManager.getLogStorageKey('track_logs'),
        maxPersist: persistedLogLimit('track', config?.maxLogs ?? 200),
        isActive: () => runtime.active,
      },
    },
  );

/** Reset module-level state for testing */
export function _resetTrackForTesting(): void {
  trackChannel = createEventChannel<TrackLogPayload>();
}
