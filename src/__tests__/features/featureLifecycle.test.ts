import { createLogRuntime } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { createConsoleLogFeature, _resetConsoleForTesting } from '../../features/console';
import { _resetNetworkForTesting } from '../../features/network';
import { createTrackFeature } from '../../features/track';
import { createNavigationLogFeature } from '../../features/navigation';
import { createStateFeature } from '../../features/state';
import type { DebugFeature } from '../../types';

function resetAllFeatureState() {
  _resetConsoleForTesting();
  _resetNetworkForTesting();
}

/**
 * Generic feature lifecycle test.
 * Validates: setup → data capture → subscribe → clear → cleanup
 */
function testFeatureLifecycle<TFeature extends DebugFeature<any>>(
  name: string,
  createFeature: () => TFeature,
  emitEvent: (feature: TFeature) => void,
  resetState: () => void = () => {},
) {
  describe(`${name} feature lifecycle`, () => {
    let feature: TFeature;

    beforeEach(() => {
      resetState();
      feature = createFeature();
    });

    afterEach(() => {
      feature.cleanup();
    });

    it('starts with empty data', () => {
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('captures data after setup + emit', () => {
      feature.setup();
      emitEvent(feature);
      expect(feature.getSnapshot().length).toBe(1);
    });

    it('does not capture before setup', () => {
      emitEvent(feature);
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('notifies subscribers on data change', () => {
      feature.setup();
      const listener = jest.fn();
      feature.subscribe?.(listener);
      emitEvent(feature);
      expect(listener).toHaveBeenCalled();
    });

    it('clears data', () => {
      feature.setup();
      emitEvent(feature);
      feature.clear?.();
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('stops capture after cleanup', () => {
      feature.setup();
      emitEvent(feature);
      feature.cleanup();
      emitEvent(feature);
      // Data from before cleanup is gone, and no new data captured
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('can setup again after cleanup', () => {
      feature.setup();
      emitEvent(feature);
      feature.cleanup();
      feature.setup();
      emitEvent(feature);
      expect(feature.getSnapshot().length).toBe(1);
    });

    it('idempotent setup — calling setup twice is safe', () => {
      feature.setup();
      feature.setup();
      emitEvent(feature);
      expect(feature.getSnapshot().length).toBe(1);
    });

    it('idempotent cleanup — calling cleanup twice is safe', () => {
      feature.setup();
      feature.cleanup();
      feature.cleanup();
      expect(feature.getSnapshot()).toEqual([]);
    });
  });
}

// ─── Track Feature ────────────────────────────────────

testFeatureLifecycle(
  'Track',
  () => createTrackFeature(undefined, testRuntime()),
  feature => feature.record({ eventName: 'test_event', payload: 'data' }),
);

// ─── Navigation Feature ───────────────────────────────

testFeatureLifecycle(
  'Navigation',
  () => createNavigationLogFeature(),
  feature => feature.record({ action: 'navigate', from: 'Home', to: 'Detail' }),
);

// ─── State Feature ──────────────────────────────────

testFeatureLifecycle(
  'State',
  () => {
    const feature = createStateFeature();
    return { ...feature, setup: () => feature.start({ owner: Symbol(), signal: new AbortController().signal, isCurrent: () => true, setStatus() {} }) };
  },
  feature => feature.record('counter', { action: 'increment', before: { count: 0 }, after: { count: 1 } }),
);

// ─── Reset functions ──────────────────────────────────

describe('feature isolation via reset', () => {
  afterEach(resetAllFeatureState);

  it('track reset isolates feature instances', () => {
    const f1 = createTrackFeature(undefined, testRuntime());
    f1.setup();
    f1.record({ eventName: 'e1' });
    f1.cleanup();

    const f2 = createTrackFeature(undefined, testRuntime());
    f2.setup();
    f2.record({ eventName: 'e2' });
    // f2 only sees its own event
    expect(f2.getSnapshot().length).toBe(1);
    expect((f2.getSnapshot()[0] as { eventName: string }).eventName).toBe('e2');
    f2.cleanup();
  });

  it('navigation reset isolates feature instances', () => {
    const f1 = createNavigationLogFeature();
    f1.setup();
    f1.record({ action: 'navigate', from: 'A', to: 'B' });
    f1.cleanup();

    const f2 = createNavigationLogFeature();
    f2.setup();
    f2.record({ action: 'navigate', from: 'C', to: 'D' });
    expect(f2.getSnapshot().length).toBe(1);
    f2.cleanup();
  });
});


describe('console ownership and snapshots', () => {
  afterEach(_resetConsoleForTesting);
  it('delivers once to each owner and restores original methods after the last owner', () => {
    const original = console.log;
    const first = createConsoleLogFeature(undefined, testRuntime());
    const second = createConsoleLogFeature(undefined, testRuntime());
    first.setup(); second.setup(); first.setup();
    const data = { count: 1, callback: jest.fn() };
    console.log(data);
    data.count = 2;
    expect(first.getSnapshot()).toHaveLength(1);
    expect(second.getSnapshot()).toHaveLength(1);
    expect(first.getSnapshot()[0]!.data).toEqual([expect.objectContaining({ count: 1 })]);
    expect(data.callback).not.toHaveBeenCalled();
    first.cleanup();
    console.log('second only');
    expect(second.getSnapshot()).toHaveLength(2);
    second.cleanup();
    expect(console.log).toBe(original);
  });
});

function testRuntime() { return createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: new MemoryStorageAdapter(), preferenceDisk: new MemoryStorageAdapter() }); }


describe('collection isolates hostile business values', () => {
  afterEach(_resetConsoleForTesting);

  it('does not invoke enumerable getters while collecting console and track data', () => {
    const getter = jest.fn(() => 123);
    const throwingGetter = jest.fn(() => { throw new Error('business getter'); });
    const data = Object.defineProperties({}, {
      value: { enumerable: true, get: getter },
      failure: { enumerable: true, get: throwingGetter },
    });
    const original = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleFeature = createConsoleLogFeature(undefined, testRuntime());
    const trackFeature = createTrackFeature(undefined, testRuntime());
    consoleFeature.setup(); trackFeature.setup();
    try {
      expect(() => console.log(data)).not.toThrow();
      expect(() => trackFeature.record({ eventName: 'accessors', data })).not.toThrow();
      expect(getter).not.toHaveBeenCalled();
      expect(throwingGetter).not.toHaveBeenCalled();
      expect(consoleFeature.getSnapshot()[0]!.data).toEqual([{ value: '[Accessor]', failure: '[Accessor]' }]);
      expect(trackFeature.getSnapshot()[0]).toMatchObject({ data: { value: '[Accessor]', failure: '[Accessor]' } });
    } finally { consoleFeature.cleanup(); trackFeature.cleanup(); original.mockRestore(); }
  });

  it('snapshots top-level track accessors before constructing a channel payload', () => {
    const getter = jest.fn(() => { throw new Error('top-level getter'); });
    const event = Object.defineProperty({ eventName: 'safe' }, 'payload', { enumerable: true, get: getter });
    const feature = createTrackFeature(undefined, testRuntime());
    feature.setup();
    try {
      expect(() => feature.record(event)).not.toThrow();
      expect(getter).not.toHaveBeenCalled();
      expect(feature.getSnapshot()[0]).toMatchObject({ eventName: 'safe', payload: '[Accessor]' });
    } finally { feature.cleanup(); }
  });

  it('keeps collecting when object inspection throws and does not invoke coercion hooks', () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error('cannot inspect'); } });
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    const fn = Object.assign(() => {}, { toString: jest.fn(() => { throw new Error('coercion'); }) });
    const date = Object.assign(new Date(0), { toISOString: jest.fn(() => { throw new Error('override'); }) });
    const original = jest.spyOn(console, 'log').mockImplementation(() => {});
    const feature = createConsoleLogFeature(undefined, testRuntime());
    feature.setup();
    try {
      expect(() => console.log(hostile, revoked.proxy, fn, date)).not.toThrow();
      expect(feature.getSnapshot()).toHaveLength(1);
      expect(feature.getSnapshot()[0]!.data).toEqual(['[Unserializable]', '[Unserializable]', '[Function]', '1970-01-01T00:00:00.000Z']);
      expect(fn.toString).not.toHaveBeenCalled();
      expect(date.toISOString).not.toHaveBeenCalled();
    } finally { feature.cleanup(); original.mockRestore(); }
  });
});
