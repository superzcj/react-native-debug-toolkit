import { createObservableStore, type ObservableStore } from './createObservableStore';
import type { StorageAdapter } from './StorageAdapter';

export interface PersistedStoreOptions<T> {
  storage: StorageAdapter;
  storageKey: string;
  maxPersist: number;
  debounceMs?: number;
  serialize?: (entry: T) => unknown;
}

export interface PersistedObservableStore<T> extends ObservableStore<T> {
  nextId: () => string;
  ready: Promise<void>;
  clearPersisted: () => void;
  dispose: () => void;
}

export function createPersistedObservableStore<T extends { id?: string }>(
  options: PersistedStoreOptions<T>,
): PersistedObservableStore<T> {
  const { storage, storageKey, maxPersist, debounceMs = 2000, serialize } = options;
  const store = createObservableStore<T>();
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let idCounter = 0;
  let resolveReady: () => void;
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });

  // Restore from storage (single notify via pushBatch)
  Promise.resolve(storage.getItem(storageKey)).then((raw) => {
    if (!raw) { resolveReady(); return; }
    try {
      const entries = JSON.parse(raw) as T[];
      if (!Array.isArray(entries)) { resolveReady(); return; }
      const restored = entries.slice(-maxPersist);
      store.pushBatch(restored);
      // Fix ID counter to avoid collision with restored entries
      let max = 0;
      for (const e of restored) {
        const n = parseInt(e.id ?? '', 10);
        if (!isNaN(n) && n >= max) {
          max = n + 1;
        }
      }
      idCounter = max;
    } catch {
      // ignore corrupt data
    }
    resolveReady();
  });

  function scheduleWrite(): void {
    if (writeTimer !== null) {
      clearTimeout(writeTimer);
    }
    writeTimer = setTimeout(() => {
      writeTimer = null;
      const data = store.getData().slice(-maxPersist);
      const toStore = serialize ? data.map(serialize) : data;
      try {
        Promise.resolve(storage.setItem(storageKey, JSON.stringify(toStore))).catch(() => {});
      } catch {
        // stringify failed (circular refs, etc) — skip write
      }
    }, debounceMs);
  }

  return {
    getData: store.getData,
    push: (item, maxEntries) => {
      store.push(item, maxEntries);
      scheduleWrite();
    },
    pushBatch: store.pushBatch,
    clear: () => {
      store.clear();
    },
    clearPersisted: () => {
      store.clear();
      if (writeTimer !== null) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      Promise.resolve(storage.setItem(storageKey, '[]')).catch(() => {});
    },
    subscribe: store.subscribe,
    nextId: () => String(idCounter++),
    ready,
    dispose: () => {
      if (writeTimer !== null) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      store.clear();
    },
  };
}
