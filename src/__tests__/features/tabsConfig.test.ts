import { normalizeConfig } from '../../core/config';
import { createTabsFeature } from '../../features/tabs';

const component = () => null;
const context = () => ({ owner: Symbol(), signal: new AbortController().signal, isCurrent: () => true, setStatus: jest.fn() });

test('empty tabs remain one visible feature and publish empty', () => {
  const feature = createTabsFeature();
  const ctx = context();
  feature.start(ctx);
  expect(feature.name).toBe('tabs');
  expect(feature.label).toBe('Custom');
  expect(feature.getSnapshot().items).toEqual([]);
  expect(ctx.setStatus).toHaveBeenLastCalledWith({ phase: 'empty', issues: [] });
  feature.dispose();
});

test('disabled items are removed before duplicate and built-in ID checks', () => {
  const parsed = normalizeConfig({ tabs: { items: [
    { id: 'console', enabled: false },
    { id: 'same', title: 'One', component },
    { id: 'same', enabled: false },
  ] } }).features.tabs;
  expect(parsed.issues).toEqual([]);
  expect(parsed.options.items).toHaveLength(1);
});

test.each([
  [{ id: 'console', title: 'Bad', component }, 'id'],
  [{ id: 'ok', title: '', component }, 'title'],
  [{ id: 'ok', title: 'Bad', component, onClear: true }, 'onClear'],
  [{ id: 'ok', title: 'Bad', component, source: {} }, 'source'],
  [{ id: 'ok', title: 'Bad', component, surprise: true }, 'surprise'],
])('validates item shape precisely', (item, field) => {
  expect(normalizeConfig({ tabs: { items: [item] } }).features.tabs.issues)
    .toEqual(expect.arrayContaining([expect.objectContaining({ path: `tabs.items[0].${field}` })]));
});

test('rejects duplicate IDs without invoking callbacks or sources', () => {
  const getSnapshot = jest.fn();
  const onActivate = jest.fn();
  const tab = { id: 'one', title: 'One', component, source: { getSnapshot, subscribe: jest.fn() }, onActivate };
  const result = normalizeConfig({ tabs: { items: [tab, tab] } });
  expect(result.features.tabs.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'tabs.items[1].id' })]));
  expect(getSnapshot).not.toHaveBeenCalled();
  expect(onActivate).not.toHaveBeenCalled();
});

test('sparse item arrays are invalid', () => {
  expect(normalizeConfig({ tabs: { items: new Array(1) } }).features.tabs.issues).not.toEqual([]);
});

test('source failure cancels just that subscription and preserves other pages', () => {
  let fail = false;
  let notify = () => {};
  const unsubscribe = jest.fn();
  const feature = createTabsFeature({ items: [
    { id: 'disabled', title: 'Disabled', component, enabled: false },
    { id: 'source', title: 'Source', component, source: {
      getSnapshot: () => { if (fail) { throw new Error('source failed'); } return 1; },
      subscribe: (listener) => { notify = listener; return unsubscribe; },
    } }, { id: 'plain', title: 'Plain', component },
  ] });
  const ctx = context();
  feature.start(ctx);
  expect(ctx.setStatus).toHaveBeenLastCalledWith({ phase: 'ready', issues: [] });
  fail = true; notify();
  expect(feature.getSnapshot().items[0]?.error).toBe('source failed');
  expect(feature.getSnapshot().items[1]?.error).toBeUndefined();
  const errorStatus = { phase: 'error', issues: [{ path: 'tabs.items[1].source', message: 'source failed' }] };
  expect(ctx.setStatus).toHaveBeenLastCalledWith(errorStatus);
  expect(feature.status).toEqual(errorStatus);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  feature.dispose(); expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test.each(['getSnapshot', 'subscribe'] as const)('source %s failure publishes feature error during startup', (failure) => {
  const source = {
    getSnapshot: () => { if (failure === 'getSnapshot') { throw new Error('initial source failure'); } return 1; },
    subscribe: () => { if (failure === 'subscribe') { throw new Error('initial source failure'); } return () => {}; },
  };
  const config = { items: [
    { id: 'bad', title: 'Bad', component, source },
    { id: 'good', title: 'Good', component, source: { getSnapshot: () => 42, subscribe: () => () => {} } },
  ] };
  expect(normalizeConfig({ tabs: config }).features.tabs.issues).toEqual([]);
  const feature = createTabsFeature(config);
  const ctx = context();
  feature.start(ctx);
  const errorStatus = { phase: 'error', issues: [{ path: 'tabs.items[0].source', message: 'initial source failure' }] };
  expect(ctx.setStatus).toHaveBeenLastCalledWith(errorStatus);
  expect(feature.status).toEqual(errorStatus);
  expect(feature.getSnapshot().items[0]?.error).toBe('initial source failure');
  expect(feature.getSnapshot().items[1]?.snapshot).toBe(42);
  expect(feature.getSnapshot().items[1]?.error).toBeUndefined();
  feature.dispose();
});

test.each([
  ['getSnapshot', false], ['subscribe', false], ['getSnapshot', true], ['subscribe', true],
] as const)('source %s preserves the original item path after filtering (normalized input: %s)', (failure, normalizedInput) => {
  let failed = true;
  let healthyValue = 1;
  let notifyHealthy = () => {};
  const config = { items: [
    { id: 'disabled', title: 'Disabled', component, enabled: false },
    { id: 'bad', title: 'Bad', component, source: {
      getSnapshot: () => { if (failed && failure === 'getSnapshot') { throw new Error('source failed'); } return 2; },
      subscribe: () => { if (failed && failure === 'subscribe') { throw new Error('source failed'); } return () => {}; },
    } },
    { id: 'good', title: 'Good', component, source: {
      getSnapshot: () => healthyValue,
      subscribe: (listener: () => void) => { notifyHealthy = listener; return () => {}; },
    } },
  ] };
  const parsed = normalizeConfig({ tabs: config }).features.tabs;
  expect(parsed.issues).toEqual([]);
  expect(parsed.options.items).toHaveLength(2);
  const feature = createTabsFeature(normalizedInput ? parsed.options : config);
  const ctx = context();
  feature.start(ctx);
  const errorStatus = { phase: 'error', issues: [{ path: 'tabs.items[1].source', message: 'source failed' }] };
  expect(feature.status).toEqual(errorStatus);
  expect(ctx.setStatus).toHaveBeenLastCalledWith(errorStatus);
  healthyValue = 3; notifyHealthy();
  expect(feature.getSnapshot().items[1]?.snapshot).toBe(3);
  expect(feature.status).toEqual(errorStatus);
  feature.dispose();
  failed = false;
  feature.start(ctx);
  expect(feature.status).toEqual({ phase: 'ready', issues: [] });
  expect(feature.getSnapshot().items[0]?.error).toBeUndefined();
  feature.dispose();
});

test('source errors survive sibling updates and clear only with a new runtime start', () => {
  let failed = true;
  let value = 1;
  let notify = () => {};
  const feature = createTabsFeature({ items: [
    { id: 'failing', title: 'Failing', component, source: {
      getSnapshot: () => { if (failed) { throw new Error('source failed'); } return 2; }, subscribe: () => () => {},
    } },
    { id: 'healthy', title: 'Healthy', component, source: {
      getSnapshot: () => value, subscribe: (listener) => { notify = listener; return () => {}; },
    } },
  ] });
  const ctx = context();
  feature.start(ctx);
  value = 3; notify();
  expect(feature.status.phase).toBe('error');
  expect(feature.status.issues).toHaveLength(1);
  expect(feature.getSnapshot().items[1]?.snapshot).toBe(3);
  feature.dispose();
  failed = false;
  feature.start(ctx);
  expect(feature.status).toEqual({ phase: 'ready', issues: [] });
  feature.dispose();
});

test('contains item lifecycle, badge and clear errors and releases sources once', () => {
  const unsubscribe = jest.fn();
  const onActivate = jest.fn();
  const onDeactivate = jest.fn();
  const feature = createTabsFeature({ items: [
    { id: 'good', title: 'Good', component, source: { getSnapshot: () => 1, subscribe: () => unsubscribe }, onActivate, onDeactivate, onClear: () => { throw new Error('clear failed'); } },
    { id: 'bad', title: 'Bad', component, onActivate: () => { throw new Error('activation failed'); } },
    { id: 'badge', title: 'Badge', component, badge: () => { throw new Error('badge failed'); } },
  ] });
  feature.start(context());
  expect(feature.getSnapshot().items.map(item => item.error)).toEqual([undefined, 'activation failed', 'badge failed']);
  feature.actions.clear('good');
  expect(feature.getSnapshot().items[0]?.error).toBe('clear failed');
  feature.dispose(); feature.dispose();
  expect(onActivate).toHaveBeenCalledTimes(1);
  expect(onDeactivate).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('disposal from a snapshot listener cannot publish ready afterward', () => {
  const feature = createTabsFeature({ items: [{ id: 'one', title: 'One', component, source: {
    getSnapshot: () => 1, subscribe: () => () => {},
  } }] });
  const ctx = context();
  let updates = 0;
  feature.subscribe!(() => { if (++updates === 2) { feature.dispose(); } });
  feature.start(ctx);
  expect(ctx.setStatus).not.toHaveBeenCalled();
});
