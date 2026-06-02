export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type MMKVLike = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
};

type MMKVLikeV4 = {
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

export class AsyncStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: AsyncStorageLike) {}

  getItem(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }

  setItem(key: string, value: string): Promise<void> {
    return this.storage.setItem(key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.storage.removeItem(key);
  }
}

export class MMKVStorageAdapter implements StorageAdapter {
  private readonly storage: MMKVLike;

  constructor(storage: MMKVLike) {
    this.storage = storage;
  }

  getItem(key: string): string | null {
    return this.storage.getString(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    if ('delete' in this.storage) {
      (this.storage as MMKVLike).delete(key);
    } else {
      (this.storage as MMKVLikeV4).remove(key);
    }
  }
}

function isAsyncStorageLike(value: unknown): value is AsyncStorageLike {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Partial<AsyncStorageLike>).getItem === 'function' &&
    typeof (value as Partial<AsyncStorageLike>).setItem === 'function' &&
    typeof (value as Partial<AsyncStorageLike>).removeItem === 'function',
  );
}

function loadMMKVStorage(): StorageAdapter | null {
  try {
    const mod = require('react-native-mmkv');
    console.warn('[StorageAdapter] MMKV module loaded, keys:', Object.keys(mod).join(','));

    // v4+: createMMKV factory function
    if (typeof mod?.createMMKV === 'function') {
      console.warn('[StorageAdapter] Found createMMKV (v4+)');
      const instance = mod.createMMKV({ id: 'debug-toolkit-logs' });
      console.warn('[StorageAdapter] createMMKV returned:', typeof instance, instance ? 'has getString:' + typeof instance.getString : 'null');
      if (instance && typeof instance.getString === 'function' && typeof instance.set === 'function') {
        return new MMKVStorageAdapter(instance as unknown as MMKVLike);
      }
    }

    // v3 and earlier: MMKV class
    const MMKV = mod?.MMKV ?? mod?.default?.MMKV ?? mod?.default;
    if (typeof MMKV === 'function') {
      return new MMKVStorageAdapter(new MMKV({ id: 'debug-toolkit-logs' }));
    }

    console.warn('[StorageAdapter] No MMKV constructor found');
    return null;
  } catch (e) {
    console.warn('[StorageAdapter] loadMMKVStorage failed:', e);
    return null;
  }
}

function loadAsyncStorage(): StorageAdapter | null {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    const storage = isAsyncStorageLike(mod?.default) ? mod.default : mod;
    if (!isAsyncStorageLike(storage)) {
      return null;
    }
    return new AsyncStorageAdapter(storage);
  } catch {
    return null;
  }
}

export function createDefaultLogStorage(): StorageAdapter {
  return loadMMKVStorage() ?? loadAsyncStorage() ?? new MemoryStorageAdapter();
}
