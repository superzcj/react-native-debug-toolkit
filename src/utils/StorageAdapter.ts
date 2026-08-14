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

let defaultStorage: StorageAdapter | null = null;

/** The Toolkit's isolated MMKV store, shared by logs, preferences, and features. */
export function createDefaultLogStorage(): StorageAdapter {
  defaultStorage ??= new MMKVStorageAdapter(
    createMMKV({ id: 'react-native-debug-toolkit' }) as unknown as MMKVLike,
  );
  return defaultStorage;
}
