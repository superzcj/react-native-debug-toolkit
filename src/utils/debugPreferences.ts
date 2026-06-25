type AsyncStorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem?: (k: string) => Promise<void>;
};
type NativePreferencesLike = {
  getPreference: (k: string) => Promise<string | null>;
  setPreference: (k: string, v: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

function loadAsyncStorage(): AsyncStorageLike | null {
  try {
    const mod = require('@react-native-async-storage/async-storage');
    const storage = mod?.default && typeof mod.default.getItem === 'function' ? mod.default : mod;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
    return null;
  } catch {
    return null;
  }
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
  const AsyncStorage = loadAsyncStorage();
  if (AsyncStorage) {
    try {
      await AsyncStorage.setItem(key, value);
      return;
    } catch {
      // degrade to memory only
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
  const AsyncStorage = loadAsyncStorage();
  if (AsyncStorage) {
    try {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) {
        return val;
      }
    } catch {
      // fall through to memory
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
  const AsyncStorage = loadAsyncStorage();
  if (AsyncStorage) {
    try {
      if (typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, '');
      }
      return;
    } catch {
      // degrade to memory only
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
  computerHost: '@react_native_debug_toolkit/computer_host',
  daemonPort: '@react_native_debug_toolkit/daemon_port',
  environmentId: '@react_native_debug_toolkit/environment_id',
} as const;
