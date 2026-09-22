import { createMMKV } from 'react-native-mmkv';

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

type MMKVLike = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string | number | boolean | ArrayBuffer) => void;
  remove: (key: string) => boolean;
};

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

export class MMKVStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: MMKVLike) {}

  getItem(key: string): string | null {
    return this.storage.getString(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.remove(key);
  }
}

let defaultStorage: StorageAdapter | undefined;

/** Uses the existing namespace so historical logs and preferences remain readable.
 * Native initialization is deferred to the first operation, inside the runtime's
 * failure boundary. Merely importing this module never opens MMKV.
 */
export function createDefaultLogStorage(): StorageAdapter {
  if (defaultStorage) { return defaultStorage; }
  let storage: MMKVStorageAdapter | undefined;
  const get = () => storage ??= new MMKVStorageAdapter(
    createMMKV({ id: 'react-native-debug-toolkit' }) as unknown as MMKVLike,
  );
  return defaultStorage = {
    getItem: key => get().getItem(key),
    setItem: (key, value) => get().setItem(key, value),
    removeItem: key => get().removeItem(key),
  };
}

/** Mirror current values in memory and stop using a failed disk permanently. */
export function createResilientStorage(
  disk: StorageAdapter,
  onFailure: (error: unknown) => void,
  rejectFailedWrites = false,
  isActive: () => boolean = () => true,
): StorageAdapter {
  const memory = new MemoryStorageAdapter();
  const known = new Set<string>();
  let failed = false;
  function failure(error: unknown, writing: boolean): void {
    failed = true;
    onFailure(error);
    if (writing && rejectFailedWrites) { throw error; }
  }
  function write(key: string, value: string | null): void | Promise<void> {
    if (!isActive()) { return; }
    known.add(key);
    if (value === null) { memory.removeItem(key); } else { memory.setItem(key, value); }
    if (failed) {
      if (rejectFailedWrites) { throw new Error('Preference storage is unavailable; changes are not saved.'); }
      return;
    }
    try {
      const result = value === null ? disk.removeItem(key) : disk.setItem(key, value);
      if (result && typeof result.then === 'function') { return result.catch(error => failure(error, true)); }
    } catch (error) { failure(error, true); }
  }
  return {
    getItem(key) {
      if (!isActive()) { return null; }
      if (failed || known.has(key)) { return memory.getItem(key); }
      const remember = (value: string | null) => {
        if (!isActive()) { return null; }
        // A newer write owns the key while an asynchronous disk read is pending.
        if (known.has(key)) { return memory.getItem(key); }
        known.add(key);
        if (value !== null) { memory.setItem(key, value); }
        return value;
      };
      try {
        const result = disk.getItem(key);
        if (result && typeof result !== 'string') {
          return result.then(remember).catch(error => { failure(error, false); return memory.getItem(key); });
        }
        return remember(result);
      } catch (error) { failure(error, false); return memory.getItem(key); }
    },
    setItem: (key, value) => write(key, value),
    removeItem: key => write(key, null),
  };
}
