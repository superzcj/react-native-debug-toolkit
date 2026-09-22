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
    { id: 'source', title: 'Source', component, source: {
      getSnapshot: () => { if (fail) { throw new Error('source failed'); } return 1; },
      subscribe: (listener) => { notify = listener; return unsubscribe; },
    } }, { id: 'plain', title: 'Plain', component },
  ] });
  feature.start(context());
  fail = true; notify();
  expect(feature.getSnapshot().items[0]?.error).toBe('source failed');
  expect(feature.getSnapshot().items[1]?.error).toBeUndefined();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  feature.dispose(); expect(unsubscribe).toHaveBeenCalledTimes(1);
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
