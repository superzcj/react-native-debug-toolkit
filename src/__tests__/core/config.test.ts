import { normalizeConfig } from '../../core/config';
import { FEATURE_KEYS } from '../../core/featureCatalog';

const validOptions = {
  network: { maxLogs: 20, excludeUrls: [/health/, '/ping'] },
  console: { maxLogs: 20 },
  native: { maxLogs: 20, minLevel: 'info', includeTags: ['app'], excludeTags: [], pollIntervalMs: 100 },
  state: { maxLogs: 20, adapters: [{ id: 'cart', getSnapshot: () => 1, subscribe: () => () => {} }] },
  navigation: { maxLogs: 20, ref: { current: null } },
  track: { maxLogs: 20 },
  connect: { appId: 'com.app', endpoint: 'http://localhost:8080' },
  clipboard: { enabled: true },
  history: { maxSessions: 3 },
  environment: { items: [{ id: 'dev', title: 'Dev', urls: { api: 'https://dev.test' } }], onChange: () => {} },
  accounts: { items: [{ id: 'a', title: 'A', tenant: 'extra' }], currentId: null, onSwitch: () => {} },
  tabs: { items: [{ id: 'custom', title: 'Custom', component: () => null }] },
};

describe('normalizeConfig', () => {
  test('empty input enables all feature pages', () => {
    const result = normalizeConfig();

    expect(result.issues).toEqual([]);
    expect(FEATURE_KEYS.filter((key) => result.features[key].enabled)).toEqual(FEATURE_KEYS);
    expect(result.features.accounts.issues).toEqual([]);
    expect(result.features.tabs.issues).toEqual([]);
  });

  test('feature errors stay local and carry the field path', () => {
    const result = normalizeConfig({ network: { maxLogs: 0 }, accounts: {} });

    expect(result.issues).toEqual([]);
    expect(result.features.network.issues[0]?.path).toBe('network.maxLogs');
    expect(result.features.accounts.issues).toEqual([]);
  });

  test.each(FEATURE_KEYS)('%s accepts an omitted config, an empty object, and explicit disable', (key) => {
    expect(normalizeConfig().features[key].issues).toEqual([]);
    expect(normalizeConfig({ [key]: {} }).features[key].issues).toEqual([]);
    expect(normalizeConfig({ [key]: { enabled: false } }).features[key]).toMatchObject({
      key,
      enabled: false,
      issues: [],
    });
  });

  test.each(FEATURE_KEYS)('%s rejects boolean, array, and unknown fields', (key) => {
    expect(normalizeConfig({ [key]: true }).features[key].issues[0]?.path).toBe(key);
    expect(normalizeConfig({ [key]: [] }).features[key].issues[0]?.path).toBe(key);
    expect(normalizeConfig({ [key]: { unknown: true } }).features[key].issues[0]?.path).toBe(
      `${key}.unknown`,
    );
  });

  test.each(FEATURE_KEYS)('%s accepts a valid supply and undefined as omission', (key) => {
    expect(normalizeConfig({ [key]: validOptions[key] }).features[key].issues).toEqual([]);
    expect(normalizeConfig({ [key]: undefined }).features[key]).toEqual(normalizeConfig().features[key]);
    expect(normalizeConfig({ [key]: null }).features[key].issues[0]?.path).toBe(key);
    expect(normalizeConfig({ [key]: { enabled: 'yes' } }).features[key].issues[0]?.path).toBe(`${key}.enabled`);
  });

  test.each([NaN, Infinity, -Infinity, 0, -1, 1.5, null, '10'])('rejects invalid positive integer %s even when disabled', (maxLogs) => {
    const result = normalizeConfig({ network: { enabled: false, maxLogs } });
    expect(result.features.network.enabled).toBe(false);
    expect(result.features.network.issues[0]?.path).toBe('network.maxLogs');
    expect(result.features.network.options.maxLogs).toBe(200);
  });

  test.each([
    ['network', 'excludeUrls', [12]], ['native', 'minLevel', 'verbose'],
    ['native', 'includeTags', [false]], ['native', 'excludeTags', null],
    ['state', 'adapters', [{}]], ['navigation', 'ref', { current: {} }],
    ['connect', 'appId', 12], ['connect', 'endpoint', false],
    ['environment', 'items', {}], ['environment', 'onChange', 12],
    ['accounts', 'source', {}], ['accounts', 'onSwitch', true],
    ['accounts', 'isAuthenticated', 'yes'], ['accounts', 'closeOnSuccess', null],
    ['accounts', 'currentDetails', [{}]], ['tabs', 'items', null],
  ])('rejects invalid %s.%s', (key, field, value) => {
    const result = normalizeConfig({ [String(key)]: { [String(field)]: value } });
    const feature = FEATURE_KEYS.find((candidate) => candidate === key)!;
    expect(result.features[feature].issues[0]?.path).toBe(`${key}.${field}`);
  });

  test.each([null, true, [], 'config'])('rejects non-object top-level input %s', (input) => {
    expect(normalizeConfig(input).issues[0]?.path).toBe('config');
  });

  test('snapshots list structure without cloning identities or invoking callbacks and sources', () => {
    const account = { id: 'a', title: 'A' };
    const items = [account];
    const source = { getSnapshot: jest.fn(), subscribe: jest.fn() };
    const callback = jest.fn();
    const result = normalizeConfig({ accounts: { items, onSwitch: callback }, state: { adapters: [{ id: 'store', ...source }] } });
    items.push({ id: 'b', title: 'B' });
    expect(result.features.accounts.options.items).toEqual([account]);
    expect((result.features.accounts.options.items as unknown[])[0]).toBe(account);
    expect(result.features.accounts.options.onSwitch).toBe(callback);
    expect(source.getSnapshot).not.toHaveBeenCalled();
    expect(source.subscribe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(normalizeConfig({ accounts: { source } }).features.accounts.options.source).toBe(source);
  });

  test('defaults are isolated across calls and resolve the first environment id', () => {
    const a = normalizeConfig();
    const b = normalizeConfig();
    expect(a.features.network.options.excludeUrls).not.toBe(b.features.network.options.excludeUrls);
    expect(a.features.environment.options.defaultId).toBeNull();
    expect(normalizeConfig({ environment: validOptions.environment }).features.environment.options.defaultId).toBe('dev');
    expect(a.features.accounts.options).toMatchObject({ items: [], scopeKey: 'default', closeOnSuccess: true });
  });

  test('valid feature supplies are retained', () => {
    const account = { id: 'a', title: 'Account A', role: 'admin' };
    const source = {
      getSnapshot: () => ({ value: 1 }),
      subscribe: () => () => {},
    };
    const navigation = { current: null };
    const exclude = /health/;
    const result = normalizeConfig({
      network: { maxLogs: 10, excludeUrls: ['localhost', exclude] },
      native: { pollIntervalMs: 100, minLevel: 'warn', includeTags: ['app'], excludeTags: [] },
      state: { adapters: [{ id: 'store', ...source }] },
      navigation: { ref: navigation },
      environment: { items: [{ id: 'dev', title: 'Development', urls: { api: 'https://dev.test' } }] },
      accounts: { items: [account], source: undefined },
      tabs: { items: [{ id: 'tab', title: 'Tab', component: () => null }] },
    });

    expect(result.issues).toEqual([]);
    expect(result.features.network.options.maxLogs).toBe(10);
    expect(result.features.network.options.excludeUrls).toEqual(['localhost', exclude]);
    expect((result.features.network.options.excludeUrls as unknown[])[1]).toBe(exclude);
    expect(result.features.state.options.adapters).toEqual([{ id: 'store', ...source }]);
    expect(result.features.navigation.options.ref).toBe(navigation);
    expect((result.features.accounts.options.items as unknown[])[0]).toBe(account);
  });

  test('top-level errors are global and feature errors remain local', () => {
    const result = normalizeConfig({ enabled: 'yes', locale: 'fr', oldFeature: {}, network: { maxLogs: 1.5 } });

    expect(result.issues.map((issue) => issue.path)).toEqual(['enabled', 'locale', 'oldFeature']);
    expect(result.features.network.issues[0]?.path).toBe('network.maxLogs');
  });

  test('undefined values use defaults and invalid positive integers are rejected', () => {
    const result = normalizeConfig({
      network: { maxLogs: undefined },
      native: { pollIntervalMs: 99 },
      history: { maxSessions: Number.NaN },
    });

    expect(result.features.network.options.maxLogs).toBe(200);
    expect(result.features.network.issues).toEqual([]);
    expect(result.features.native.issues[0]?.path).toBe('native.pollIntervalMs');
    expect(result.features.history.issues[0]?.path).toBe('history.maxSessions');
  });

  test('accounts allow extension fields and source fields are mutually exclusive', () => {
    const account = { id: 'a', title: 'Account A', tenantId: 'tenant-a' };
    const source = { getSnapshot: () => ({ items: [account] }), subscribe: () => () => {} };
    const result = normalizeConfig({
      accounts: { items: [account], onSwitch: () => {}, source },
    });

    expect(result.features.accounts.issues.map((issue) => issue.path)).toContain('accounts.source');
    expect((result.features.accounts.options.items as unknown[])[0]).toBe(account);
  });

  test('normalizes bounded quick actions without adding a feature page', () => {
    const first = { id: 'cart', title: 'Cart', onPress: jest.fn() };
    const second = { id: 'refresh', title: 'Refresh', onPress: jest.fn(), closeOnPress: false };
    const result = normalizeConfig({ quickActions: { items: [first, second] } });

    expect(result.issues).toEqual([]);
    expect(result.quickActions.items).toEqual([
      expect.objectContaining({ id: 'cart', closeOnPress: true }),
      expect.objectContaining({ id: 'refresh', closeOnPress: false }),
    ]);
    expect(result.quickActions.items[0]?.onPress).toBe(first.onPress);
    expect(FEATURE_KEYS).toHaveLength(12);
  });

  test('rejects missing, duplicate, and over-limit quick action definitions', () => {
    const actions = Array.from({ length: 6 }, (_, index) => ({
      id: index === 0 || index === 4 ? 'a' : index === 5 ? 'a5' : `a${index}`,
      title: `Action ${index}`,
      onPress: jest.fn(),
    }));
    const result = normalizeConfig({ quickActions: { items: actions } });

    expect(result.issues.map((issue) => issue.path)).toEqual([
      'quickActions.items[4].id',
      'quickActions.items[5]',
    ]);
    expect(result.quickActions.items).toHaveLength(4);
  });
});
