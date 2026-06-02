import type { AnyDebugFeature } from '../../types';

export function resolveStoredTabIndex(
  features: AnyDebugFeature[],
  storedTab: string | null,
): number {
  if (!storedTab) return 0;

  const nameIndex = features.findIndex((feature) => feature.name === storedTab);
  if (nameIndex >= 0) return nameIndex;

  const legacyIndex = Number(storedTab);
  if (
    Number.isInteger(legacyIndex) &&
    legacyIndex >= 0 &&
    legacyIndex < features.length
  ) {
    return legacyIndex;
  }

  return 0;
}
