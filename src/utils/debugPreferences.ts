import type { StorageAdapter } from './StorageAdapter';

let preferenceStorage: StorageAdapter | undefined;
export function bindPreferenceStorage(storage: StorageAdapter): () => void {
  const lease = { storage };
  activeLease = lease;
  preferenceStorage = storage;
  return () => { if (activeLease === lease) { activeLease = undefined; preferenceStorage = undefined; } };
}
let activeLease: { storage: StorageAdapter } | undefined;

export async function setPreference(key: string, value: string): Promise<void> {
  await preferenceStorage?.setItem(key, value);
}

export async function getPreference(key: string): Promise<string | null> {
  return preferenceStorage?.getItem(key) ?? null;
}

export async function removePreference(key: string): Promise<void> {
  await preferenceStorage?.removeItem(key);
}

/**
 * Persist a UI preference without allowing a storage failure to reject the
 * event handler that initiated it. The returned error keeps the failure
 * observable to callers that can render it; fire-and-forget callers can rely
 * on the warning and the runtime storage capability issue instead.
 */
export async function persistPreference(key: string, value: string | null): Promise<unknown | null> {
  try {
    if (value === null) {
      await removePreference(key);
    } else {
      await setPreference(key, value);
    }
    return null;
  } catch (error) {
    console.warn(`[DebugToolkit] Failed to persist preference "${key}":`, error);
    return error;
  }
}

export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  environmentId: '@react_native_debug_toolkit/environment_id',
  hubEndpoint: '@react_native_debug_toolkit/hub_endpoint',
} as const;
