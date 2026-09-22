import { createToolkitRuntime } from '../../core/runtime';
import { normalizeConfig } from '../../core/config';
import type {
  FeatureContext,
  FeatureDriver,
  FeatureStatus,
  RuntimeDependencies,
} from '../../core/runtimeTypes';

function createDependencies(
  overrides: Partial<RuntimeDependencies> = {},
): RuntimeDependencies {
  return {
    detectDebugBuild: jest.fn().mockResolvedValue(true),
    fallbackDev: true,
    createDriver: jest.fn(() => ({
      start: jest.fn(),
      dispose: jest.fn(),
    })),
    publish: jest.fn(),
    ...overrides,
  };
}

function createDriver(
  start: FeatureDriver['start'],
  dispose: FeatureDriver['dispose'] = jest.fn(),
): FeatureDriver {
  return { start, dispose };
}

describe('createToolkitRuntime', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('late build detection cannot install after dispose', async () => {
    let finish!: (value: boolean) => void;
    const detection = new Promise<boolean>((resolve) => { finish = resolve; });
    const createDriverMock = jest.fn(() => createDriver(jest.fn()));
    const deps = createDependencies({
      detectDebugBuild: () => detection,
      createDriver: createDriverMock,
    });
    const runtime = createToolkitRuntime(normalizeConfig(), deps);

    runtime.start();
    runtime.dispose();
    finish(true);

    expect((await runtime.ready).status).toBe('cancelled');
    expect(createDriverMock).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  test('start is idempotent and gives the same completed result', async () => {
    const start = jest.fn();
    const deps = createDependencies({
      createDriver: jest.fn(() => createDriver(start)),
    });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);

    runtime.start();
    runtime.start();

    const result = await runtime.ready;
    expect(result.status).toBe('ready');
    expect(start).toHaveBeenCalledTimes(12);
    expect(deps.publish).toHaveBeenCalledTimes(13);
  });

  test('registers every enabled page before starting its drivers', async () => {
    const events: string[] = [];
    const deps = createDependencies({
      createDriver: jest.fn(() => createDriver(() => { events.push('start'); })),
      publish: jest.fn(() => { events.push('publish'); }),
    });
    const runtime = createToolkitRuntime(normalizeConfig({
      enabled: true,
      network: { enabled: false },
    }), deps);

    runtime.start();
    await runtime.ready;

    expect(events[0]).toBe('publish');
    expect(events.filter((event) => event === 'start')).toHaveLength(11);
    const firstPages = (deps.publish as jest.Mock).mock.calls[0]?.[0] as Record<string, FeatureStatus>;
    expect(Object.keys(firstPages)).toHaveLength(11);
    expect(firstPages.network).toBeUndefined();
  });

  test('a failed driver is isolated and other drivers finish', async () => {
    const failed = new Error('network start failed');
    const statuses: Array<Record<string, FeatureStatus>> = [];
    let index = 0;
    const dispose = jest.fn();
    const deps = createDependencies({
      createDriver: jest.fn(() => {
        const current = index++;
        return createDriver(
          current === 0 ? () => Promise.reject(failed) : () => undefined,
          dispose,
        );
      }),
      publish: jest.fn((features) => { statuses.push(features as Record<string, FeatureStatus>); }),
    });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);

    runtime.start();
    const result = await runtime.ready;

    expect(result.status).toBe('partial');
    expect(result.features.network?.phase).toBe('error');
    expect(Object.values(result.features).filter((status) => status.phase === 'ready')).toHaveLength(11);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)?.network?.phase).toBe('error');
  });

  test('a driver that reports empty remains empty', async () => {
    const empty: FeatureStatus = { phase: 'empty', issues: [] };
    const deps = createDependencies({
      createDriver: jest.fn(() => createDriver((context) => { context.setStatus(empty); })),
    });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);

    runtime.start();
    const result = await runtime.ready;

    expect(result.status).toBe('ready');
    expect(Object.values(result.features)).toHaveLength(12);
    expect(Object.values(result.features).every((status) => status.phase === 'empty')).toBe(true);
  });

  test('explicit enabled and fallback values take precedence over native detection', async () => {
    const detectDebugBuild = jest.fn().mockResolvedValue(false);
    const explicitEnabled = createDependencies({ detectDebugBuild });
    const enabledRuntime = createToolkitRuntime(normalizeConfig({ enabled: true }), explicitEnabled);
    enabledRuntime.start();
    expect((await enabledRuntime.ready).status).toBe('ready');
    expect(detectDebugBuild).not.toHaveBeenCalled();

    const explicitDisabled = createDependencies({ detectDebugBuild: jest.fn().mockResolvedValue(true) });
    const disabledRuntime = createToolkitRuntime(normalizeConfig({ enabled: false }), explicitDisabled);
    disabledRuntime.start();
    expect((await disabledRuntime.ready).status).toBe('disabled');
    expect(explicitDisabled.createDriver).not.toHaveBeenCalled();

    const fallbackDisabled = createDependencies({
      detectDebugBuild: jest.fn().mockResolvedValue(undefined),
      fallbackDev: false,
    });
    const fallbackRuntime = createToolkitRuntime(normalizeConfig(), fallbackDisabled);
    fallbackRuntime.start();
    expect((await fallbackRuntime.ready).status).toBe('disabled');
  });

  test('global configuration issues stop the toolkit with an error result', async () => {
    const deps = createDependencies();
    const runtime = createToolkitRuntime(normalizeConfig({ unexpected: true }), deps);

    runtime.start();
    const result = await runtime.ready;

    expect(result.status).toBe('error');
    expect(result.issues.map((issue) => issue.path)).toEqual(['unexpected']);
    expect(deps.detectDebugBuild).not.toHaveBeenCalled();
    expect(deps.createDriver).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  test('timeout disposes started drivers and blocks late status publication', async () => {
    jest.useFakeTimers();
    const lateStatus: FeatureStatus = { phase: 'ready', issues: [] };
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const disposes: jest.Mock[] = [];
    const deps = createDependencies({
      createDriver: jest.fn(() => {
        const dispose = jest.fn();
        disposes.push(dispose);
        return createDriver(async (context) => {
          await pending;
          context.setStatus(lateStatus);
        }, dispose);
      }),
    });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);

    runtime.start();
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await runtime.ready;
    const callsAtTimeout = (deps.publish as jest.Mock).mock.calls.length;

    expect(result.status).toBe('initialization_timeout');
    expect(disposes).toHaveLength(12);
    expect(disposes.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(Object.values(result.features).every((status) => status.phase === 'error')).toBe(true);

    finish();
    await Promise.resolve();
    expect((deps.publish as jest.Mock).mock.calls).toHaveLength(callsAtTimeout);
  });

  test('an unresolved build detection is bounded by the initialization deadline', async () => {
    jest.useFakeTimers();
    const detection = new Promise<boolean>(() => undefined);
    const deps = createDependencies({ detectDebugBuild: () => detection });
    const runtime = createToolkitRuntime(normalizeConfig(), deps);

    runtime.start();
    await jest.advanceTimersByTimeAsync(10_000);

    expect((await runtime.ready).status).toBe('initialization_timeout');
    expect(deps.createDriver).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });

  test('dispose aborts feature signals and disposes in reverse creation order', async () => {
    const controllers: AbortSignal[] = [];
    const disposed: number[] = [];
    let index = 0;
    const deps = createDependencies({
      createDriver: jest.fn(() => {
        const current = index++;
        return createDriver((context) => {
          controllers.push(context.signal);
          return undefined;
        }, () => { disposed.push(current); });
      }),
    });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);

    runtime.start();
    await runtime.ready;
    runtime.dispose();

    expect(controllers.every((signal) => signal.aborted)).toBe(true);
    expect(disposed).toEqual([...Array(12).keys()].reverse());
    expect((await runtime.ready).status).toBe('ready');
  });
  test('ready is not_started until start is called', async () => {
    const deps = createDependencies();
    const runtime = createToolkitRuntime(normalizeConfig(), deps);
    expect(await runtime.ready).toEqual({ status: 'not_started', features: {}, issues: [] });
    expect(deps.detectDebugBuild).not.toHaveBeenCalled();
    runtime.start();
    expect((await runtime.ready).status).toBe('ready');
    runtime.dispose();
  });

  test.each([
    [true, false, 'ready'],
    [false, true, 'disabled'],
    [undefined, true, 'ready'],
    [undefined, false, 'disabled'],
    [undefined, undefined, 'disabled'],
  ])('native %s with fallback %s gives %s', async (native, fallbackDev, expected) => {
    const deps = createDependencies({ detectDebugBuild: jest.fn().mockResolvedValue(native), fallbackDev });
    const runtime = createToolkitRuntime(normalizeConfig(), deps);
    runtime.start();
    expect((await runtime.ready).status).toBe(expected);
    runtime.dispose();
  });

  test('feature configuration errors retain the page without creating its driver', async () => {
    const deps = createDependencies();
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true, network: { maxLogs: -1 } }), deps);
    runtime.start();
    const result = await runtime.ready;
    expect(result.status).toBe('partial');
    expect(result.features.network).toEqual({ phase: 'error', issues: [{ path: 'network.maxLogs', message: 'Invalid configuration value.' }] });
    expect(deps.createDriver).toHaveBeenCalledTimes(11);
    runtime.dispose();
  });

  test('unavailable is terminal and is not overwritten by automatic ready', async () => {
    const deps = createDependencies({ createDriver: () => createDriver((context) => context.setStatus({ phase: 'unavailable', issues: [] })) });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);
    runtime.start();
    expect((await runtime.ready).status).toBe('partial');
    expect((await runtime.ready).features.network?.phase).toBe('unavailable');
    runtime.dispose();
  });

  test('deadline includes detection time and invalidates every context before cleanup', async () => {
    jest.useFakeTimers();
    let finishDetection!: (value: boolean) => void;
    const detection = new Promise<boolean>((resolve) => { finishDetection = resolve; });
    const contexts: FeatureContext[] = [];
    const deps = createDependencies({
      detectDebugBuild: () => detection,
      createDriver: () => createDriver((context) => {
        contexts.push(context);
        return new Promise<void>(() => undefined);
      }, () => {
        expect(contexts.every((context) => !context.isCurrent() && context.signal.aborted)).toBe(true);
        contexts[0]?.setStatus({ phase: 'ready', issues: [] });
      }),
    });
    const runtime = createToolkitRuntime(normalizeConfig(), deps);
    runtime.start();
    await jest.advanceTimersByTimeAsync(9_000);
    finishDetection(true);
    await jest.advanceTimersByTimeAsync(999);
    expect(contexts).toHaveLength(12);
    expect(contexts[0]?.isCurrent()).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    expect((await runtime.ready).status).toBe('initialization_timeout');
    expect((await runtime.ready).features.network?.issues[0]?.message).toMatch(/timed out/i);
  });

  test('all empty drivers settle ready and clear the deadline', async () => {
    jest.useFakeTimers();
    const deps = createDependencies({ createDriver: () => createDriver((context) => context.setStatus({ phase: 'empty', issues: [] })) });
    const runtime = createToolkitRuntime(normalizeConfig({ enabled: true }), deps);
    runtime.start();
    expect((await runtime.ready).status).toBe('ready');
    const calls = (deps.publish as jest.Mock).mock.calls.length;
    await jest.advanceTimersByTimeAsync(10_000);
    expect((deps.publish as jest.Mock).mock.calls).toHaveLength(calls);
    expect(jest.getTimerCount()).toBe(0);
    runtime.dispose();
  });

});
