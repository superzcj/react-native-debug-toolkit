import type { AnyDebugFeature } from '../../types';

export function filterFeatureSnapshot(
  feature: AnyDebugFeature,
  snapshot: unknown,
  query: string,
  filterMode: 'all' | 'bad',
): unknown {
  if (!Array.isArray(snapshot)) return snapshot;

  const name = feature.name;
  const supportsBad =
    name === 'network' || name === 'console' || name === 'native';

  return (snapshot as unknown[]).filter((item) => {
    if (filterMode === 'bad' && supportsBad) {
      if (!isBad(name, item as Record<string, unknown>)) return false;
    }
    if (query) {
      const hay = extractSearchableText(item).toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });
}

function isBad(
  featureName: string,
  item: Record<string, unknown>,
): boolean {
  if (featureName === 'network') {
    const resp = item.response as Record<string, unknown> | undefined;
    return !!(item.error || ((resp?.status as number) ?? 0) >= 400);
  }
  // console, native
  const lvl = (item.level as string) ?? '';
  return lvl === 'warn' || lvl === 'error' || lvl === 'fatal';
}

function extractSearchableText(item: unknown): string {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (Array.isArray(item)) return item.map(extractSearchableText).join(' ');
  const parts: string[] = [];
  for (const val of Object.values(item as Record<string, unknown>)) {
    const t = extractSearchableText(val);
    if (t) parts.push(t);
  }
  return parts.join(' ');
}
