import { createObservableStore, type ObservableStore } from './createObservableStore';
import { sanitizeDebugLogEntry } from './deviceReport';
import type { StorageAdapter } from './StorageAdapter';

export interface PersistedStoreOptions<T> {
  storage: StorageAdapter;
  storageKey: string;
  maxPersist: number;
  debounceMs?: number;
  serialize?: (entry: T) => unknown;
  isActive?: () => boolean;
  maxEntries?: number;
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

  let revision = 0;
  let pendingWrite: Promise<void> | undefined;
  const active = () => options.isActive?.() ?? true;
  const restoreRevision = revision;
  // Normalize synchronous throws into a rejected promise; stale restores must not
  // resurrect cleared/disposed logs or overwrite events captured during the read.
  void Promise.resolve().then(() => active() ? storage.getItem(storageKey) : null).then((raw) => {
    if (!raw || !active() || revision !== restoreRevision) { return; }
    const entries = JSON.parse(raw) as T[];
    if (!Array.isArray(entries)) { return; }
    const restored = entries.slice(-Math.min(maxPersist, options.maxEntries ?? maxPersist));
    store.pushBatch(restored);
    for (const entry of restored) {
      const n = Number.parseInt(entry.id ?? '', 10);
      if (Number.isFinite(n)) { idCounter = Math.max(idCounter, n + 1); }
    }
  }).catch(() => {}).finally(() => resolveReady());

  function write(value: string): void {
    const perform = () => active() ? storage.setItem(storageKey, value) : undefined;
    try {
      const result = pendingWrite ? pendingWrite.then(perform) : perform();
      if (result && typeof result.then === 'function') {
        const next = result.catch(() => {});
        pendingWrite = next;
        void next.finally(() => { if (pendingWrite === next) { pendingWrite = undefined; } });
      }
    } catch { /* Runtime storage reports the capability failure and retains memory. */ }
  }

  function scheduleWrite(): void {
    if (!active()) { return; }
    if (writeTimer !== null) {
      clearTimeout(writeTimer);
    }
    writeTimer = setTimeout(() => {
      writeTimer = null;
      const data = store.getData().slice(-maxPersist);
      const toStore = serialize ? data.map(serialize) : data;
      try {
        write(JSON.stringify(toStore));
      } catch {
        // stringify failed (circular refs, etc) — skip write
      }
    }, debounceMs);
  }

  return {
    getData: store.getData,
    push: (item, maxEntries) => {
      if (!active()) { return; }
      revision += 1;
      store.push(sanitizeDebugLogEntry(item) as T, maxEntries);
      scheduleWrite();
    },
    pushBatch: items => {
      if (!active()) { return; }
      revision += 1;
      items.forEach(item => store.push(sanitizeDebugLogEntry(item) as T, options.maxEntries));
      scheduleWrite();
    },
    clear: () => {
      revision += 1;
      store.clear();
    },
    clearPersisted: () => {
      revision += 1;
      store.clear();
      if (writeTimer !== null) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      write('[]');
    },
    subscribe: store.subscribe,
    nextId: () => String(idCounter++),
    ready,
    dispose: () => {
      if (writeTimer !== null) {
        clearTimeout(writeTimer);
        writeTimer = null;
      }
      revision += 1;
      store.clear();
    },
  };
}
