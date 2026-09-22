import { sanitizeDebugLogEntry } from '../../utils/deviceReport';
import { TrackLogTab } from './TrackLogTab';
import type { DebugFeature, TrackLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createChannelFeature } from '../../utils/createChannelFeature';
import { persistedLogLimit, type LogRuntimeContext } from '../../utils/logRuntime';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';

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

export interface TrackFeature extends DebugFeature<TrackLogEntry[]>, FeatureDriver {
  record(event: TrackEventData): void;
}

export const createTrackFeature = (
  config: TrackFeatureConfig | undefined,
  runtime: LogRuntimeContext,
): TrackFeature => {
  const channel = createEventChannel<TrackLogPayload>();
  let active = false;
  let context: FeatureContext | undefined;
  let removeLegacy: (() => void) | undefined;
  const current = () => active && runtime.active && (!context || (context.isCurrent() && !context.signal.aborted));
  const base = createChannelFeature(
    () => channel,
    (payload, id) => ({ ...payload, id }),
    {
      name: 'track',
      label: 'Track',
      renderContent: TrackLogTab,
      maxLogs: config?.maxLogs,
      beforePush: payload => current() ? payload : null,
      persist: {
        storage: runtime.logStorage,
        storageKey: runtime.sessionManager.getLogStorageKey('track_logs'),
        maxPersist: persistedLogLimit('track', config?.maxLogs ?? 200),
        isActive: () => runtime.active,
      },
    },
  );
  const status = () => {
    if (current()) {context?.setStatus({ phase: base.getSnapshot().length ? 'ready' : 'empty', issues: [] });}
  };
  const record = (event: TrackEventData) => {
    if (!current()) {return;}
    const snapshot = sanitizeDebugLogEntry(event) as TrackEventData;
    channel.emit({ ...snapshot, timestamp: Date.now() });
    status();
  };
  const setup = () => {
    if (active || !runtime.active) {return;}
    active = true;
    base.setup();
    removeLegacy = trackChannel.subscribe(payload => { if (current()) { channel.emit(payload); status(); } });
  };
  const dispose = () => {
    active = false;
    context?.signal.removeEventListener('abort', dispose);
    removeLegacy?.(); removeLegacy = undefined;
    base.cleanup();
  };
  return {
    ...base, setup, cleanup: dispose, dispose, record,
    clear() { base.clear?.(); status(); },
    start(ctx) {
      if (active || !runtime.active || ctx.signal.aborted || !ctx.isCurrent()) {return;}
      context = ctx; setup();
      ctx.signal.addEventListener('abort', dispose, { once: true });
      status();
    },
  };
};

/** Reset module-level state for testing */
export function _resetTrackForTesting(): void {
  trackChannel = createEventChannel<TrackLogPayload>();
}
