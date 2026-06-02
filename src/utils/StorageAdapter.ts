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
  constructor(private readonly storage: MMKVLike) {}

  getItem(key: string): string | null {
    return this.storage.getString(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
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
    const MMKV = mod?.MMKV ?? mod?.default?.MMKV ?? mod?.default;
    if (typeof MMKV !== 'function') {
      return null;
    }
    return new MMKVStorageAdapter(new MMKV({ id: 'debug-toolkit-logs' }));
  } catch {
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
