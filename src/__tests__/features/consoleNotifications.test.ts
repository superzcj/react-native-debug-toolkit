import { createConsoleLogFeature, _resetConsoleForTesting, type ConsoleFeature } from '../../features/console';
import { createLogRuntime, type LogRuntimeContext } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';

describe('console subscription notifications', () => {
  let feature: ConsoleFeature;
  let runtime: LogRuntimeContext;

  beforeEach(async () => {
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      jest.spyOn(console, level).mockImplementation(() => {});
    }
    runtime = createLogRuntime({
      history: { enabled: false, maxSessions: 5 },
      logDisk: new MemoryStorageAdapter(),
      preferenceDisk: new MemoryStorageAdapter(),
    });
    feature = createConsoleLogFeature({ maxLogs: 3 }, runtime);
    await feature.setup();
  });

  afterEach(() => {
    feature.cleanup();
    runtime.dispose();
    _resetConsoleForTesting();
    jest.restoreAllMocks();
  });

  it('captures synchronously but coalesces subscriber notifications after the logging call stack', async () => {
    const listener = jest.fn();
    let unsubscribe = () => {};
    const notified = new Promise<void>(resolve => {
      unsubscribe = feature.subscribe!(() => { listener(); resolve(); });
    });
    const data = { count: 1 };

    console.log('first');
    console.info('second');
    console.warn(data);
    data.count = 2;
    console.error('last');

    expect(listener).not.toHaveBeenCalled();
    expect(feature.getSnapshot().map(entry => entry.level)).toEqual(['info', 'warn', 'error']);
    expect(feature.getSnapshot()[1]!.data).toEqual([{ count: 1 }]);
    await notified;
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not deliver a queued notification after unsubscribe', async () => {
    const listener = jest.fn();
    const unsubscribe = feature.subscribe!(listener);
    feature.record('queued');
    unsubscribe();

    // The sentinel runs after the notification microtask; no timer is involved.
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(listener).not.toHaveBeenCalled();
    expect(feature.getSnapshot()[0]!.data).toEqual(['queued']);
  });

  it('notifies the cleared snapshot without resurrecting pending logs', async () => {
    const listener = jest.fn();
    let unsubscribe = () => {};
    const notified = new Promise<void>(resolve => {
      unsubscribe = feature.subscribe!(() => { listener(feature.getSnapshot()); resolve(); });
    });
    feature.record('queued before clear');
    feature.clear?.();

    expect(feature.getSnapshot()).toEqual([]);
    await notified;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([]);
    unsubscribe();
  });

  it('does not notify after feature cleanup', async () => {
    const listener = jest.fn();
    const unsubscribe = feature.subscribe!(listener);
    feature.record('queued before cleanup');
    feature.cleanup();

    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(listener).not.toHaveBeenCalled();
    expect(feature.getSnapshot()).toEqual([]);
    unsubscribe();
  });
});
