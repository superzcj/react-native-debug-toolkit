import type { DebugEnvironment } from '../../types';

type UrlMap = Record<string, string>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeAbsoluteUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

function matchesPrefixBoundary(url: string, prefix: string): boolean {
  if (url === prefix) {
    return true;
  }

  if (!url.startsWith(prefix)) {
    return false;
  }

  const next = url.charAt(prefix.length);
  return next === '/' || next === '?' || next === '#';
}

interface PrefixPair {
  key: string;
  source: string;
  target: string;
}

function buildPrefixPairs(sourceUrls: UrlMap, targetUrls: UrlMap): PrefixPair[] {
  return Object.keys(sourceUrls)
    .map((key) => {
      const source = normalizeAbsoluteUrl(sourceUrls[key]!);
      const targetRaw = targetUrls[key];
      const target = targetRaw ? normalizeAbsoluteUrl(targetRaw) : null;
      if (!source || !target) {
        return null;
      }
      return { key, source, target };
    })
    .filter((pair): pair is PrefixPair => pair != null)
    .sort((a, b) => b.source.length - a.source.length);
}

export function rewriteByLongestPrefix(
  url: string,
  sourceUrls: UrlMap,
  targetUrls: UrlMap,
): string {
  const normalizedUrl = normalizeAbsoluteUrl(url);
  if (!normalizedUrl) {
    return url;
  }

  const pair = buildPrefixPairs(sourceUrls, targetUrls).find((candidate) =>
    matchesPrefixBoundary(normalizedUrl, candidate.source),
  );

  if (!pair) {
    return url;
  }

  return `${pair.target}${normalizedUrl.slice(pair.source.length)}`;
}

export function buildManagedUrlRewriter(
  defaultEnvironment: DebugEnvironment | null,
  activeEnvironment: DebugEnvironment | null,
): ((url: string) => string) | null {
  if (!defaultEnvironment || !activeEnvironment) {
    return null;
  }

  if (defaultEnvironment.id === activeEnvironment.id) {
    return null;
  }

  return (url: string) =>
    rewriteByLongestPrefix(url, defaultEnvironment.urls, activeEnvironment.urls);
}
