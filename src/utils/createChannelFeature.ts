import type { ComponentType } from 'react';
import type { DebugFeature, DebugFeatureListener, DebugFeatureRenderProps } from '../types';
import type { EventChannel } from './createEventChannel';
import { createObservableStore, type ObservableStore } from './createObservableStore';
import {
  createPersistedObservableStore,
  type PersistedObservableStore,
} from './createPersistedObservableStore';
import type { StorageAdapter } from './StorageAdapter';

const DEFAULT_MAX_LOGS = 200;

export interface ChannelFeaturePersistConfig<TEntry> {
  storage: StorageAdapter;
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
    /** Return null to skip, or the (possibly modified) payload to proceed. */
    beforePush?: (payload: TPayload) => TPayload | null;
    /** Called after channel subscription in setup. Return a cleanup function. */
    onSetup?: () => (() => void) | void;
  },
): DebugFeature<TEntry[]> {
  const maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS;
  let nextId = 0;
  let logStore: ObservableStore<TEntry>;
  let persistedStore: PersistedObservableStore<TEntry> | null = null;
  let getId: () => string;

  if (options.persist) {
    const persisted = createPersistedObservableStore<TEntry>({
      storage: options.persist.storage,
      storageKey: options.persist.storageKey,
      maxPersist: options.persist.maxPersist,
      debounceMs: options.persist.debounceMs,
      serialize: options.persist.serialize,
    });
    persistedStore = persisted;
    logStore = persisted;
    getId = () => persisted.nextId();
  } else {
    logStore = createObservableStore<TEntry>();
    getId = () => String(nextId++);
  }

  let initialized = false;
  let unsubscribe: (() => void) | null = null;
  let customCleanup: (() => void) | null = null;

  return {
    name: options.name,
    label: options.label,
    renderContent: options.renderContent,
    setup: () => {
      if (initialized) {
        return;
      }
      unsubscribe = getChannel().subscribe((payload) => {
        const filtered = options.beforePush ? options.beforePush(payload) : payload;
        if (filtered == null) {
          return;
        }
        logStore.push(toEntry(filtered, getId()), maxLogs);
      });
      const cleanup = options.onSetup?.();
      if (cleanup) {
        customCleanup = cleanup;
      }
      initialized = true;
    },
    getSnapshot: () => logStore.getData(),
    clear: () => {
      if (persistedStore) {
        persistedStore.clearPersisted();
      } else {
        logStore.clear();
      }
    },
    cleanup: () => {
      customCleanup?.();
      customCleanup = null;
      unsubscribe?.();
      unsubscribe = null;
      if (persistedStore) {
        persistedStore.dispose();
      } else {
        logStore.clear();
      }
      initialized = false;
    },
    subscribe: (listener: DebugFeatureListener) => logStore.subscribe(listener),
  };
}
