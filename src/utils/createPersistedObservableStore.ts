import { createObservableStore, type ObservableStore } from './createObservableStore';
import { getPreference, setPreference } from './debugPreferences';

export interface PersistedStoreOptions<T> {
  storageKey: string;
  maxPersist: number;
  debounceMs?: number;
  serialize?: (entry: T) => unknown;
}

export interface PersistedObservableStore<T> extends ObservableStore<T> {
  /** Returns the next auto-incrementing ID and advances the counter. */
  nextId: () => string;
}

export function createPersistedObservableStore<T extends { id?: string }>(
  options: PersistedStoreOptions<T>,
): PersistedObservableStore<T> {
  const { storageKey, maxPersist, debounceMs = 2000, serialize } = options;
  const store = createObservableStore<T>();
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let idCounter = 0;

  // Restore from storage (single notify via pushBatch)
  getPreference(storageKey).then((raw) => {
    if (!raw) return;
    try {
      const entries = JSON.parse(raw) as T[];
      if (!Array.isArray(entries)) return;
      const restored = entries.slice(-maxPersist);
      store.pushBatch(restored);
      // Fix ID counter to avoid collision with restored entries
      let max = 0;
      for (const e of restored) {
        const n = parseInt(e.id ?? '', 10);
        if (!isNaN(n) && n >= max) max = n + 1;
      }
      idCounter = max;
    } catch {
      // ignore corrupt data
    }
  });

  function scheduleWrite(): void {
    if (writeTimer !== null) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      const data = store.getData().slice(-maxPersist);
      const toStore = serialize ? data.map(serialize) : data;
      try {
        setPreference(storageKey, JSON.stringify(toStore));
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
      if (writeTimer !== null) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      setPreference(storageKey, '[]');
    },
    subscribe: store.subscribe,
    nextId: () => String(idCounter++),
  };
}
