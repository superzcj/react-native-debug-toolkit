import { _resetTrackForTesting } from '../../features/track';
import { _resetNavigationForTesting } from '../../features/navigation';
import { _resetConsoleForTesting } from '../../features/console';
import { _resetNetworkForTesting } from '../../features/network';
import { _resetZustandForTesting } from '../../features/zustand';
import { addTrackLog, createTrackFeature } from '../../features/track';
import { addNavigationLog, createNavigationLogFeature } from '../../features/navigation';
import { addZustandLog, createZustandLogFeature } from '../../features/zustand';
import type { DebugFeature } from '../../types';

function resetAllFeatureState() {
  _resetTrackForTesting();
  _resetNavigationForTesting();
  _resetConsoleForTesting();
  _resetNetworkForTesting();
  _resetZustandForTesting();
}

/**
 * Generic feature lifecycle test.
 * Validates: setup → data capture → subscribe → clear → cleanup
 */
function testFeatureLifecycle<TEntry>(
  name: string,
  createFeature: () => DebugFeature<TEntry[]>,
  emitEvent: () => void,
  resetState: () => void,
) {
  describe(`${name} feature lifecycle`, () => {
    let feature: DebugFeature<TEntry[]>;

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
      emitEvent();
      expect(feature.getSnapshot().length).toBe(1);
    });

    it('does not capture before setup', () => {
      emitEvent();
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('notifies subscribers on data change', () => {
      feature.setup();
      const listener = jest.fn();
      feature.subscribe?.(listener);
      emitEvent();
      expect(listener).toHaveBeenCalled();
    });

    it('clears data', () => {
      feature.setup();
      emitEvent();
      feature.clear?.();
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('stops capture after cleanup', () => {
      feature.setup();
      emitEvent();
      feature.cleanup();
      emitEvent();
      // Data from before cleanup is gone, and no new data captured
      expect(feature.getSnapshot()).toEqual([]);
    });

    it('can setup again after cleanup', () => {
      feature.setup();
      emitEvent();
      feature.cleanup();
      feature.setup();
      emitEvent();
      expect(feature.getSnapshot().length).toBe(1);
    });

    it('idempotent setup — calling setup twice is safe', () => {
      feature.setup();
      feature.setup();
      emitEvent();
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
  () => createTrackFeature(),
  () => addTrackLog({ eventName: 'test_event', payload: 'data' }),
  _resetTrackForTesting,
);

// ─── Navigation Feature ───────────────────────────────

testFeatureLifecycle(
  'Navigation',
  () => createNavigationLogFeature(),
  () => addNavigationLog('navigate', 'Home', 'Detail'),
  _resetNavigationForTesting,
);

// ─── Zustand Feature ──────────────────────────────────

testFeatureLifecycle(
  'Zustand',
  () => createZustandLogFeature(),
  () => addZustandLog('increment', { count: 0 }, { count: 1 }),
  _resetZustandForTesting,
);

// ─── Reset functions ──────────────────────────────────

describe('feature isolation via reset', () => {
  afterEach(resetAllFeatureState);

  it('track reset isolates feature instances', () => {
    const f1 = createTrackFeature();
    f1.setup();
    addTrackLog({ eventName: 'e1' });
    f1.cleanup();
    _resetTrackForTesting();

    const f2 = createTrackFeature();
    f2.setup();
    addTrackLog({ eventName: 'e2' });
    // f2 only sees its own event
    expect(f2.getSnapshot().length).toBe(1);
    expect((f2.getSnapshot()[0] as { eventName: string }).eventName).toBe('e2');
    f2.cleanup();
  });

  it('navigation reset isolates feature instances', () => {
    const f1 = createNavigationLogFeature();
    f1.setup();
    addNavigationLog('navigate', 'A', 'B');
    f1.cleanup();
    _resetNavigationForTesting();

    const f2 = createNavigationLogFeature();
    f2.setup();
    addNavigationLog('navigate', 'C', 'D');
    expect(f2.getSnapshot().length).toBe(1);
    f2.cleanup();
  });
});
