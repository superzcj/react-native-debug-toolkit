import type { StorageAdapter } from '../../utils/StorageAdapter';

const LAST_USED_STORAGE_PREFIX =
  'react-native-debug-toolkit.quick-accounts.last:';

export function getQuickAccountsLastUsedStorageKey(scopeKey: string): string {
  return `${LAST_USED_STORAGE_PREFIX}${scopeKey}`;
}

export async function readLastUsedQuickAccountId(
  storage: StorageAdapter,
  scopeKey: string,
): Promise<string | null> {
  if (!scopeKey) {
    return null;
  }
  return storage.getItem(getQuickAccountsLastUsedStorageKey(scopeKey));
}

export async function writeLastUsedQuickAccountId(
  storage: StorageAdapter,
  scopeKey: string,
  accountId: string,
): Promise<void> {
  if (!scopeKey) {
    return;
  }
  await storage.setItem(
    getQuickAccountsLastUsedStorageKey(scopeKey),
    accountId,
  );
}
