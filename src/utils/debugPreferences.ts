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

export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  environmentId: '@react_native_debug_toolkit/environment_id',
  hubEndpoint: '@react_native_debug_toolkit/hub_endpoint',
} as const;
