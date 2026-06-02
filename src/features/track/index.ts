import { TrackLogTab } from './TrackLogTab';
import type { DebugFeature, TrackLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createChannelFeature } from '../../utils/createChannelFeature';
import { getDefaultLogRuntime, type LogRuntimeContext } from '../../utils/logRuntime';

export interface TrackEventData {
  eventName: string;
  [key: string]: unknown;
}

type TrackLogPayload = TrackEventData & { timestamp: number };

let trackChannel = createEventChannel<TrackLogPayload>();

export const addTrackLog = (eventData: TrackEventData): void => {
  trackChannel.emit({ timestamp: Date.now(), ...eventData });
};

export interface TrackFeatureConfig {
  /** Maximum number of track events to keep (default: 200) */
  maxLogs?: number;
}

export const createTrackFeature = (
  config?: TrackFeatureConfig,
  runtime: LogRuntimeContext = getDefaultLogRuntime(),
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
        maxPersist: 50,
      },
    },
  );

/** Reset module-level state for testing */
export function _resetTrackForTesting(): void {
  trackChannel = createEventChannel<TrackLogPayload>();
}
