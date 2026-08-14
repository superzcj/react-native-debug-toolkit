import { createDefaultLogStorage } from './StorageAdapter';

export async function setPreference(key: string, value: string): Promise<void> {
  await createDefaultLogStorage().setItem(key, value);
}

export async function getPreference(key: string): Promise<string | null> {
  return createDefaultLogStorage().getItem(key);
}

export async function removePreference(key: string): Promise<void> {
  await createDefaultLogStorage().removeItem(key);
}

export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  environmentId: '@react_native_debug_toolkit/environment_id',
  hubEndpoint: '@react_native_debug_toolkit/hub_endpoint',
} as const;
