import type { ConfigIssue } from '../../core/config';
import type { DebugEnvironment } from '../../types/environment';

export interface NormalizedEnvironmentConfig {
  items: readonly DebugEnvironment[];
  defaultId: string | null;
  issues: readonly ConfigIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEnvironment(input: unknown): NormalizedEnvironmentConfig {
  const issues: ConfigIssue[] = [];
  const items: DebugEnvironment[] = [];
  const issue = (path: string, message: string) => { issues.push({ path, message }); };
  if (input === undefined) { return { items: [], defaultId: null, issues }; }
  if (!isRecord(input) || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
    return { items: [], defaultId: null, issues: [{ path: 'environment', message: 'Expected a feature configuration object.' }] };
  }
  for (const key of Object.keys(input)) {
    if (!['enabled', 'items', 'defaultId', 'onChange'].includes(key)) { issue('environment.' + key, 'Unknown configuration field.'); }
  }
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') { issue('environment.enabled', 'Expected a boolean.'); }
  if (input.onChange !== undefined && typeof input.onChange !== 'function') { issue('environment.onChange', 'Expected a function.'); }
  if (input.defaultId !== undefined && typeof input.defaultId !== 'string') { issue('environment.defaultId', 'Expected an environment ID.'); }
  if (input.items !== undefined && !Array.isArray(input.items)) { issue('environment.items', 'Expected an array.'); }
  const ids = new Set<string>();
  let serviceKeys: string[] | undefined;
  Array.from(Array.isArray(input.items) ? input.items : []).forEach((item: unknown, index) => {
    const path = 'environment.items[' + index + ']';
    if (!isRecord(item)) { issue(path, 'Expected an environment object.'); return; }
    const initialIssues = issues.length;
    for (const key of Object.keys(item)) {
      if (!['id', 'title', 'urls'].includes(key)) { issue(path + '.' + key, 'Unknown environment field.'); }
    }
    for (const key of ['id', 'title']) {
      if (typeof item[key] !== 'string' || !(item[key] as string).trim()) { issue(path + '.' + key, 'Expected a non-empty string.'); }
    }
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) { issue(path + '.id', 'Duplicate environment ID.'); }
      ids.add(item.id);
    }
    if (!isRecord(item.urls) || !Object.keys(item.urls).length) { issue(path + '.urls', 'Expected at least one service URL.'); }
    else {
      const keys = Object.keys(item.urls).sort();
      if (serviceKeys && (keys.length !== serviceKeys.length || keys.some((key, i) => key !== serviceKeys![i]))) {
        issue(path + '.urls', 'All environments must declare the same service keys.');
      }
      serviceKeys ??= keys;
      const prefixes = new Set<string>();
      for (const [key, value] of Object.entries(item.urls)) {
        const urlPath = path + '.urls.' + key;
        if (!key.trim()) { issue(urlPath, 'Expected a non-empty service key.'); }
        try {
          if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) { throw new Error(); }
          const parsed = new URL(value);
          if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) { throw new Error(); }
          const prefix = parsed.toString().replace(/\/+$/, '');
          if (prefixes.has(prefix)) { issue(urlPath, 'Ambiguous duplicate service prefix.'); }
          prefixes.add(prefix);
        } catch { issue(urlPath, 'Expected an absolute HTTP(S) URL.'); }
      }
    }
    if (issues.length === initialIssues) {
      items.push(Object.freeze({ id: item.id as string, title: item.title as string, urls: Object.freeze({ ...item.urls as Record<string, string> }) }));
    }
  });
  let defaultId: string | null = items[0]?.id ?? null;
  if (Array.isArray(input.items) && input.items.length && typeof input.defaultId === 'string') {
    if (!items.some(item => item.id === input.defaultId)) { issue('environment.defaultId', 'Default ID must match an environment.'); }
    else { defaultId = input.defaultId; }
  }
  return { items: Object.freeze(items), defaultId, issues };
}
