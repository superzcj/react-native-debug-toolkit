import type { ComponentType } from 'react';
import type { DebugFeature, DebugFeatureListener, DebugFeatureRenderProps } from '../types';
import type { EventChannel } from './createEventChannel';
import { createObservableStore, type ObservableStore } from './createObservableStore';
import { createPersistedObservableStore } from './createPersistedObservableStore';

const DEFAULT_MAX_LOGS = 200;

export interface ChannelFeaturePersistConfig<TEntry> {
  storageKey: string;
  maxPersist: number;
  debounceMs?: number;
  serialize?: (entry: TEntry) => unknown;
}

/**
 * Generic factory for features that subscribe to an event channel.
 * Eliminates boilerplate across channel-based features (Track, Navigation, Zustand).
 *
 * @param getChannel - Function returning the current channel (supports test resets)
 * @param toEntry - Maps a payload + auto-generated id to a typed log entry
 * @param options - Feature name, label, render component, and optional maxLogs
 */
export function createChannelFeature<TPayload, TEntry extends { id?: string }>(
  getChannel: () => EventChannel<TPayload>,
  toEntry: (payload: TPayload, id: string) => TEntry,
  options: {
    name: string;
    label: string;
    renderContent?: ComponentType<DebugFeatureRenderProps<TEntry[]>>;
    maxLogs?: number;
    persist?: ChannelFeaturePersistConfig<TEntry>;
  },
): DebugFeature<TEntry[]> {
  const maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS;
  let nextId = 0;
  let logStore: ObservableStore<TEntry>;
  let getId: () => string;

  if (options.persist) {
    const persisted = createPersistedObservableStore<TEntry>({
      storageKey: options.persist.storageKey,
      maxPersist: options.persist.maxPersist,
      debounceMs: options.persist.debounceMs,
      serialize: options.persist.serialize,
    });
    logStore = persisted;
    getId = () => persisted.nextId();
  } else {
    logStore = createObservableStore<TEntry>();
    getId = () => String(nextId++);
  }

  let initialized = false;
  let unsubscribe: (() => void) | null = null;

  return {
    name: options.name,
    label: options.label,
    renderContent: options.renderContent,
    setup: () => {
      if (initialized) return;
      unsubscribe = getChannel().subscribe((payload) => {
        logStore.push(toEntry(payload, getId()), maxLogs);
      });
      initialized = true;
    },
    getSnapshot: () => logStore.getData(),
    clear: () => {
      logStore.clear();
    },
    cleanup: () => {
      unsubscribe?.();
      unsubscribe = null;
      logStore.clear();
      initialized = false;
    },
    subscribe: (listener: DebugFeatureListener) => logStore.subscribe(listener),
  };
}
