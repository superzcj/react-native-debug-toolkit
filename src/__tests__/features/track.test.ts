import { createTrackFeature } from '../../features/track';
import { createLogRuntime } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import type { FeatureContext } from '../../core/runtimeTypes';

test('manual track events are unbuffered and isolated to their live owner', () => {
  const runtime = createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: new MemoryStorageAdapter(), preferenceDisk: new MemoryStorageAdapter() });
  const first = createTrackFeature(undefined, runtime);
  const second = createTrackFeature(undefined, runtime);
  const controller = new AbortController();
  const ctx: FeatureContext = { owner: Symbol(), signal: controller.signal, isCurrent: () => !controller.signal.aborted, setStatus: jest.fn() };
  first.record({ eventName: 'before' });
  first.start(ctx); second.start({ ...ctx, owner: Symbol() });
  expect(first.getSnapshot()).toEqual([]);
  const getter = jest.fn(() => { throw new Error('getter'); });
  const data = { count: 1 };
  first.record(Object.defineProperty({ eventName: 'checkout', data }, 'extra', { enumerable: true, get: getter }));
  data.count = 2;
  expect(first.getSnapshot()).toEqual([expect.objectContaining({ eventName: 'checkout', data: { count: 1 }, extra: '[Accessor]' })]);
  expect(second.getSnapshot()).toEqual([]);
  expect(getter).not.toHaveBeenCalled();
  controller.abort();
  first.record({ eventName: 'late' });
  expect(first.getSnapshot()).toEqual([]);
  first.dispose(); second.dispose(); runtime.dispose();
});

test('disposed runtime rejects track calls even while feature remains mounted', () => {
  const runtime = createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: new MemoryStorageAdapter(), preferenceDisk: new MemoryStorageAdapter() });
  const feature = createTrackFeature(undefined, runtime);
  feature.start({ owner: Symbol(), signal: new AbortController().signal, isCurrent: () => true, setStatus: jest.fn() });
  runtime.dispose(); feature.record({ eventName: 'late' });
  expect(feature.getSnapshot()).toEqual([]);
  feature.dispose();
});
