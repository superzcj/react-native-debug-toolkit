import { FEATURE_KEYS } from './featureCatalog';
import { normalizeEnvironment } from '../features/environment/environmentConfig';
import type { FeatureKey } from './featureCatalog';

export interface ConfigIssue { path: string; message: string }

// Keep provenance outside public configuration fields and preserve it when the
// host passes already-normalized descriptors through a feature's own parser.
const tabItemPaths = new WeakMap<object, string>();
export function getTabItemPath(item: object, index: number): string {
  return tabItemPaths.get(item) ?? `tabs.items[${index}]`;
}

export type NormalizedFeature = {
  key: FeatureKey;
  enabled: boolean;
  options: Readonly<Record<string, unknown>>;
  issues: readonly ConfigIssue[];
};

export interface NormalizedConfig {
  enabled: boolean | undefined;
  locale: 'en' | 'zh-CN' | undefined;
  issues: readonly ConfigIssue[];
  features: Readonly<Record<FeatureKey, NormalizedFeature>>;
}

export const FEATURE_FIELDS: Readonly<Record<FeatureKey, readonly string[]>> = {
  network: ['maxLogs', 'excludeUrls'],
  console: ['maxLogs'],
  native: ['maxLogs', 'minLevel', 'includeTags', 'excludeTags', 'pollIntervalMs'],
  state: ['maxLogs', 'adapters'],
  navigation: ['maxLogs', 'ref'],
  track: ['maxLogs'],
  connect: ['appId', 'endpoint'],
  clipboard: [],
  history: ['maxSessions'],
  environment: ['items', 'defaultId', 'onChange'],
  accounts: ['items', 'currentId', 'scopeKey', 'contextLabel', 'isAuthenticated',
    'currentDetails', 'source', 'onSwitch', 'onRollback', 'onSuccess', 'onError', 'closeOnSuccess'],
  tabs: ['items'],
};

export const FEATURE_DEFAULTS: Readonly<Record<FeatureKey, Readonly<Record<string, unknown>>>> = {
  network: { maxLogs: 200, excludeUrls: [] },
  console: { maxLogs: 200 },
  native: { maxLogs: 200, includeTags: [], excludeTags: [], pollIntervalMs: 500 },
  state: { maxLogs: 200, adapters: [] },
  navigation: { maxLogs: 200 },
  track: { maxLogs: 200 },
  connect: {},
  clipboard: {},
  history: { maxSessions: 5 },
  environment: { items: [], defaultId: null },
  accounts: { items: [], scopeKey: 'default', closeOnSuccess: true },
  tabs: { items: [] },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isSource(value: unknown): boolean {
  return isRecord(value) && typeof value.getSnapshot === 'function' && typeof value.subscribe === 'function';
}

function isNavigationRef(value: unknown): boolean {
  if (!isRecord(value)) {return false;}
  const ref = value.current;
  return ref === null || (isRecord(ref)
    && (ref.isReady === undefined || typeof ref.isReady === 'function')
    && typeof ref.getCurrentRoute === 'function'
    && typeof ref.getRootState === 'function'
    && typeof ref.addListener === 'function');
}

function isString(value: unknown): value is string { return typeof value === 'string'; }

function isList(value: unknown, validate: (item: unknown) => boolean): boolean {
  // Array.from also visits sparse slots, which must not bypass validation.
  return Array.isArray(value) && Array.from(value).every(validate);
}

function validField(key: FeatureKey, field: string, value: unknown): boolean {
  switch (field) {
    case 'enabled':
    case 'isAuthenticated':
    case 'closeOnSuccess':
      return typeof value === 'boolean';
    case 'maxLogs':
    case 'maxSessions':
    case 'pollIntervalMs':
      return typeof value === 'number' && Number.isSafeInteger(value)
        && value >= (field === 'pollIntervalMs' ? 100 : 1);
    case 'excludeUrls':
      return isList(value, (item) => isString(item) || item instanceof RegExp);
    case 'includeTags':
    case 'excludeTags':
      return isList(value, isString);
    case 'minLevel':
      return isString(value) && ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'unknown'].includes(value);
    case 'adapters':
      return isList(value, (item) => isRecord(item) && isString(item.id) && isSource(item));
    case 'ref':
      return isNavigationRef(value);
    case 'source':
      return isSource(value);
    case 'currentId':
      return value === null || isString(value);
    case 'appId':
    case 'endpoint':
    case 'defaultId':
    case 'scopeKey':
    case 'contextLabel':
      return isString(value);
    case 'onChange':
    case 'onSwitch':
    case 'onRollback':
    case 'onSuccess':
    case 'onError':
      return typeof value === 'function';
    case 'currentDetails':
      return isList(value, (item) => isRecord(item) && isString(item.title) && isString(item.value));
    case 'items':
      // The feature parsers add URL, ID and lifecycle constraints in their own units.
      return isList(value, (item) => {
        if (!isRecord(item) || !isString(item.id) || !isString(item.title)) {return false;}
        if (key === 'environment') {return isRecord(item.urls) && Object.values(item.urls).every(isString);}
        if (key === 'accounts') {return (item.subtitle === undefined || isString(item.subtitle))
          && (item.note === undefined || isString(item.note));}
        return typeof item.component === 'function' || (isRecord(item.component) && typeof item.component.$$typeof === 'symbol');
      });
    default:
      return false;
  }
}

function snapshotValue(value: unknown): unknown {
  return Array.isArray(value) ? Object.freeze([...value]) : value;
}

function normalizeFeature(key: FeatureKey, input: unknown): NormalizedFeature {
  if (key === 'environment') {
    const parsed = normalizeEnvironment(input);
    return {
      key, enabled: isConfigObject(input) && input.enabled === false ? false : true,
      options: Object.freeze({ items: parsed.items, defaultId: parsed.defaultId,
        ...(isConfigObject(input) && typeof input.onChange === 'function' ? { onChange: input.onChange } : {}) }),
      issues: parsed.issues,
    };
  }
  const issues: ConfigIssue[] = [];
  const options: Record<string, unknown> = Object.fromEntries(
    Object.entries(FEATURE_DEFAULTS[key]).map(([field, value]) => [field, snapshotValue(value)]),
  );
  let enabled = true;
  if (input !== undefined) {
    if (!isConfigObject(input)) {
      issues.push({ path: key, message: 'Expected a feature configuration object.' });
    } else {
      for (const [field, value] of Object.entries(input)) {
        const path = `${key}.${field}`;
        if (field !== 'enabled' && !FEATURE_FIELDS[key].includes(field)) {
          issues.push({ path, message: 'Unknown configuration field.' });
        } else if (value !== undefined) {
          if (key === 'tabs' && field === 'items' && Array.isArray(value)) {
            const ids = new Set<string>(FEATURE_KEYS);
            const items: unknown[] = [];
            Array.from(value).forEach((item: unknown, index: number) => {
              const itemPath = isRecord(item) ? getTabItemPath(item, index) : `tabs.items[${index}]`;
              if (isRecord(item) && item.enabled === false) { return; }
              if (!isConfigObject(item)) {
                issues.push({ path: itemPath, message: 'Expected a custom page configuration object.' }); return;
              }
              const allowed = ['id', 'title', 'enabled', 'component', 'source', 'onActivate', 'onDeactivate', 'onClear', 'badge'];
              for (const name of Object.keys(item)) {
                if (!allowed.includes(name)) { issues.push({ path: `${itemPath}.${name}`, message: 'Unknown custom page field.' }); }
              }
              for (const name of ['id', 'title']) {
                if (typeof item[name] !== 'string' || !(item[name] as string).trim()) {
                  issues.push({ path: `${itemPath}.${name}`, message: 'Expected a non-empty string.' });
                }
              }
              if (typeof item.id === 'string') {
                if (ids.has(item.id)) { issues.push({ path: `${itemPath}.id`, message: 'Custom page IDs must be unique and cannot use built-in IDs.' }); }
                ids.add(item.id);
              }
              if (!(typeof item.component === 'function' || (isRecord(item.component) && typeof item.component.$$typeof === 'symbol'))) {
                issues.push({ path: `${itemPath}.component`, message: 'Expected a React component.' });
              }
              for (const name of ['onActivate', 'onDeactivate', 'onClear', 'badge']) {
                if (item[name] !== undefined && typeof item[name] !== 'function') {
                  issues.push({ path: `${itemPath}.${name}`, message: 'Expected a function.' });
                }
              }
              if (item.source !== undefined && !isSource(item.source)) { issues.push({ path: `${itemPath}.source`, message: 'Expected a source.' }); }
              if (item.enabled !== undefined && typeof item.enabled !== 'boolean') { issues.push({ path: `${itemPath}.enabled`, message: 'Expected a boolean.' }); }
              const normalizedItem = Object.freeze({ ...item });
              tabItemPaths.set(normalizedItem, itemPath);
              items.push(normalizedItem);
            });
            options.items = Object.freeze(items);
          } else if (!validField(key, field, value)) {
            issues.push({ path, message: 'Invalid configuration value.' });
          } else if (field === 'enabled') {
            enabled = value === true;
          } else {
            options[field] = snapshotValue(value);
          }
        }
      }
      if (key === 'accounts' && input.source !== undefined) {
        const staticFields = ['items', 'currentId', 'scopeKey', 'contextLabel', 'isAuthenticated', 'currentDetails'];
        if (staticFields.some((field) => input[field] !== undefined)) {
          issues.push({ path: 'accounts.source', message: 'Source and static account data are mutually exclusive.' });
        }
        // Dynamic data must not acquire static defaults that violate its XOR.
        for (const field of staticFields) {
          if (input[field] === undefined) { delete options[field]; }
        }
      }
      if (key === 'accounts' && Array.isArray(input.items)) {
        const ids = new Set<string>();
        input.items.forEach((item: unknown, index: number) => {
          if (!isRecord(item)) { return; }
          for (const field of ['id', 'title']) {
            if (typeof item[field] !== 'string' || !(item[field] as string).trim()) {
              issues.push({ path: `accounts.items[${index}].${field}`, message: 'Expected a non-empty string.' });
            }
          }
          if (typeof item.id === 'string') {
            if (ids.has(item.id)) { issues.push({ path: `accounts.items[${index}].id`, message: 'Account IDs must be unique.' }); }
            ids.add(item.id);
          }
        });
      }
    }
  }
  return { key, enabled, options: Object.freeze(options), issues };
}

export function normalizeConfig(input?: unknown): NormalizedConfig {
  const issues: ConfigIssue[] = [];
  let enabled: boolean | undefined;
  let locale: 'en' | 'zh-CN' | undefined;
  let config: Record<string, unknown> = {};
  if (input !== undefined) {
    if (!isConfigObject(input)) {
      issues.push({ path: 'config', message: 'Expected a configuration object.' });
    } else {
      config = input;
      for (const [field, value] of Object.entries(config)) {
        if (field === 'enabled') {
          if (value === undefined || typeof value === 'boolean') {enabled = value;}
          else {issues.push({ path: field, message: 'Expected a boolean.' });}
        } else if (field === 'locale') {
          if (value === undefined || value === 'en' || value === 'zh-CN') {locale = value;}
          else {issues.push({ path: field, message: 'Expected en or zh-CN.' });}
        } else if (!FEATURE_KEYS.some((key) => key === field)) {
          issues.push({ path: field, message: 'Unknown configuration field.' });
        }
      }
    }
  }
  // The fixed catalog supplies every key, including invalid or disabled features.
  const features = Object.fromEntries(FEATURE_KEYS.map((key) => [key, normalizeFeature(key, config[key])])) as Record<FeatureKey, NormalizedFeature>;
  return { enabled, locale, issues, features };
}
