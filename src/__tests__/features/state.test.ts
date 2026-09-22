import { createStateFeature } from '../../features/state';
import type { FeatureContext } from '../../core/runtimeTypes';

function context() {
  const controller = new AbortController();
  const ctx: FeatureContext = { owner: Symbol(), signal: controller.signal, isCurrent: () => !controller.signal.aborted, setStatus: jest.fn() };
  return { controller, ctx };
}

test('initial snapshot is not a change; later changes preserve serializable before and after', () => {
  const action = jest.fn();
  let state: Record<string, unknown> = { count: 0, action };
  state.self = state;
  let notify!: () => void;
  const release = jest.fn();
  const feature = createStateFeature({ adapters: [{ id: 'cart', getSnapshot: () => state, subscribe(listener) { notify = listener; return release; } }] });
  const { controller, ctx } = context();
  feature.start(ctx);
  expect(feature.getSnapshot()).toEqual([]);
  state.count = 99;
  state = { count: 1, action }; notify(); notify();
  state.count = 100;
  expect(feature.getSnapshot()).toEqual([expect.objectContaining({ storeId: 'cart', action: 'change', before: { count: 0, action: '[Function]', self: '[Circular]' }, after: { count: 1, action: '[Function]' } })]);
  expect(action).not.toHaveBeenCalled();
  controller.abort(); feature.dispose();
  expect(release).toHaveBeenCalledTimes(1);
});

test('manual channel works without adapters and discards calls before start or after cancellation', () => {
  const feature = createStateFeature({ maxLogs: 1 });
  const { ctx, controller } = context();
  feature.record('cart', { action: 'early', before: 0, after: 1 });
  feature.start(ctx);
  expect(ctx.setStatus).toHaveBeenLastCalledWith({ phase: 'empty', issues: [] });
  expect(feature.getSnapshot()).toEqual([]);
  feature.record('cart', { action: 'add', before: 1, after: 2 });
  feature.record('cart', { action: 'remove', before: 2, after: 1 });
  expect(feature.getSnapshot()).toEqual([expect.objectContaining({ action: 'remove' })]);
  controller.abort(); feature.record('cart', { action: 'late', before: 1, after: 9 });
  expect(feature.getSnapshot()).toEqual([]);
});

test('one broken source reports its path and does not prevent other subscriptions or cleanup', () => {
  let notify!: () => void;
  let value = 1;
  const release = jest.fn(() => { throw new Error('release'); });
  const feature = createStateFeature({ adapters: [
    { id: 'broken', getSnapshot() { throw new Error('broken'); }, subscribe: jest.fn() },
    { id: 'working', getSnapshot: () => value, subscribe(listener) { notify = listener; return release; } },
  ] });
  const { ctx } = context(); feature.start(ctx);
  expect(ctx.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error', issues: [expect.objectContaining({ path: 'state.adapters[0]' })] }));
  value = 2; notify();
  expect(feature.getSnapshot()).toHaveLength(1);
  expect(() => feature.dispose()).not.toThrow();
  expect(release).toHaveBeenCalledTimes(1);
});
