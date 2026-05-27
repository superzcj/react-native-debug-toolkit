// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncStorageLike = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };

const memoryStore = new Map<string, string>();

function loadAsyncStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-async-storage/async-storage');
    if (mod && typeof mod.getItem === 'function') return mod;
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
      if (val !== null) return val;
    } catch {
      // fall through to memory
    }
  }
  return memoryStore.get(key) ?? null;
}

export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  consoleLogs: '@react_native_debug_toolkit/console_logs',
  networkLogs: '@react_native_debug_toolkit/network_logs',
  trackLogs: '@react_native_debug_toolkit/track_logs',
  computerHost: '@react_native_debug_toolkit/computer_host',
} as const;
