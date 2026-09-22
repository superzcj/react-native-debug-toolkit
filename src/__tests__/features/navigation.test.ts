import { createNavigationLogFeature } from '../../features/navigation';
import type { FeatureContext } from '../../core/runtimeTypes';
import type { DebugNavigationRef } from '../../types/navigation';

function context() {
  const controller = new AbortController();
  const ctx: FeatureContext = { owner: Symbol(), signal: controller.signal, isCurrent: () => !controller.signal.aborted, setStatus: jest.fn() };
  return { controller, ctx };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('no ref is empty with no timers and supports manual events', async () => {
  const feature = createNavigationLogFeature(); const { ctx } = context();
  feature.record({ action: 'early', to: 'Ignored' });
  await feature.start(ctx);
  expect(jest.getTimerCount()).toBe(0);
  expect(ctx.setStatus).toHaveBeenLastCalledWith({ phase: 'empty', issues: [] });
  expect(feature.getSnapshot()).toEqual([]);
  feature.record({ action: 'navigate', to: 'Home', state: { id: 1 } });
  expect(feature.getSnapshot()).toEqual([expect.objectContaining({ action: 'navigate', to: 'Home', state: { id: 1 } })]);
  feature.dispose();
});

test('waits for current and readiness, observes real routes and deduplicates key/name', async () => {
  let ready = false;
  let route: { key?: string; name: string } | undefined;
  let listener!: () => void;
  const release = jest.fn();
  const ref: { current: DebugNavigationRef | null } = { current: null };
  const feature = createNavigationLogFeature({ ref }); const { ctx, controller } = context();
  const pending = feature.start(ctx);
  ref.current = { isReady: () => ready, getCurrentRoute: () => route, getRootState: () => ({ route }), addListener(_event, callback) { listener = callback; return release; } };
  jest.advanceTimersByTime(100); expect(listener).toBeUndefined();
  ready = true; jest.advanceTimersByTime(100); await pending;
  expect(feature.getSnapshot()).toEqual([]);
  route = { name: 'Home', key: 'a' }; listener(); listener();
  route = { name: 'Home', key: 'b' }; listener();
  route = { name: 'Other' }; listener(); listener();
  expect(feature.getSnapshot().map(log => [log.action, log.from, log.to])).toEqual([['change', undefined, 'Home'], ['change', 'Home', 'Home'], ['change', 'Home', 'Other']]);
  route.name = 'mutated';
  expect(feature.getSnapshot()[2]?.state).toEqual({ route: { name: 'Other' } });
  controller.abort(); expect(release).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('cancellation settles readiness and removes polling', async () => {
  const { ctx, controller } = context();
  const feature = createNavigationLogFeature({ ref: { current: null } });
  const pending = feature.start(ctx); controller.abort(); await pending;
  expect(jest.getTimerCount()).toBe(0); expect(ctx.setStatus).not.toHaveBeenCalledWith(expect.objectContaining({ phase: 'ready' }));
});

test('unready ref stops waiting at ten seconds', async () => {
  const { ctx } = context(); const feature = createNavigationLogFeature({ ref: { current: null } });
  const pending = feature.start(ctx); jest.advanceTimersByTime(10_000); await pending;
  expect(jest.getTimerCount()).toBe(0);
  expect(ctx.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'unavailable' }));
  feature.dispose();
});

test('manual navigation snapshots do not execute accessors and do not leak to other owners', async () => {
  const first = createNavigationLogFeature(); const second = createNavigationLogFeature();
  const { ctx } = context(); await first.start(ctx); await second.start(ctx);
  const getter = jest.fn(() => { throw new Error('getter'); });
  first.record(Object.defineProperty({ action: 'open', to: 'Home' }, 'state', { enumerable: true, get: getter }));
  expect(getter).not.toHaveBeenCalled();
  expect(first.getSnapshot()).toEqual([expect.objectContaining({ state: '[Accessor]' })]);
  expect(second.getSnapshot()).toEqual([]);
  first.dispose(); second.dispose();
});

test('a failing route read releases its listener without escaping into navigation', async () => {
  let listener!: () => void;
  let broken = false;
  const release = jest.fn();
  const feature = createNavigationLogFeature({ ref: { current: {
    getCurrentRoute() { if (broken) {throw new Error('bad route');} return { name: 'Home' }; },
    getRootState: () => ({}), addListener(_event, callback) { listener = callback; return release; },
  } } });
  const { ctx } = context(); await feature.start(ctx); broken = true;
  expect(() => listener()).not.toThrow();
  expect(release).toHaveBeenCalledTimes(1);
  expect(ctx.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
  feature.dispose(); expect(release).toHaveBeenCalledTimes(1);
});
