import type { StorageAdapter } from './StorageAdapter';

type NativePreferencesLike = {
  getPreference: (k: string) => Promise<string | null>;
  setPreference: (k: string, v: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();
let hostPreferenceStorage: StorageAdapter | null = null;

export function setPreferenceStorage(storage?: StorageAdapter): void {
  hostPreferenceStorage = storage ?? null;
}

function loadNativePreferences(): NativePreferencesLike | null {
  try {
    const { NativeModules } = require('react-native') as { NativeModules?: { DebugToolkitDevConnect?: Partial<NativePreferencesLike> } };
    const mod = NativeModules?.DebugToolkitDevConnect;
    if (
      mod &&
      typeof mod.getPreference === 'function' &&
      typeof mod.setPreference === 'function'
    ) {
      return mod as NativePreferencesLike;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setPreference(key: string, value: string): Promise<void> {
  memoryStore.set(key, value);
  if (hostPreferenceStorage) {
    try {
      await hostPreferenceStorage.setItem(key, value);
      return;
    } catch {
      // fall through to native preferences
    }
  }

  const nativePreferences = loadNativePreferences();
  if (nativePreferences) {
    try {
      await nativePreferences.setPreference(key, value);
    } catch {
      // degrade to memory only
    }
  }
}

export async function getPreference(key: string): Promise<string | null> {
  if (hostPreferenceStorage) {
    try {
      return await hostPreferenceStorage.getItem(key);
    } catch {
      // fall through to native preferences
    }
  }

  const nativePreferences = loadNativePreferences();
  if (nativePreferences) {
    try {
      const val = await nativePreferences.getPreference(key);
      if (val !== null) {
        return val;
      }
    } catch {
      // fall through to memory
    }
  }

  return memoryStore.get(key) ?? null;
}

export async function removePreference(key: string): Promise<void> {
  memoryStore.delete(key);
  if (hostPreferenceStorage) {
    try {
      await hostPreferenceStorage.removeItem(key);
      return;
    } catch {
      // fall through to native preferences
    }
  }

  const nativePreferences = loadNativePreferences();
  if (nativePreferences) {
    try {
      await nativePreferences.setPreference(key, '');
    } catch {
      // degrade to memory only
    }
  }
}

export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  environmentId: '@react_native_debug_toolkit/environment_id',
} as const;
