import { FEATURE_KEYS } from './featureCatalog';
import type { FeatureKey } from './featureCatalog';

export interface ConfigIssue { path: string; message: string }

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
          if (!validField(key, field, value)) {
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
      }
      if (key === 'environment' && input.defaultId === undefined && Array.isArray(options.items)) {
        const first: unknown = options.items[0];
        options.defaultId = isRecord(first) ? first.id : null;
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
