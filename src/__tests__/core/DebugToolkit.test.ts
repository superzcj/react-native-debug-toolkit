import { DebugToolkit } from '../../core/DebugToolkit';
import type { DebugFeature } from '../../types';

function createFeature(name: string): DebugFeature<string> {
  return {
    name,
    label: name,
    setup: jest.fn(),
    getSnapshot: () => 'snapshot',
    cleanup: jest.fn(),
  };
}

describe('DebugToolkit feature management', () => {
  afterEach(() => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('adds and removes runtime features', () => {
    const feature = createFeature('custom');

    DebugToolkit.addFeature(feature);
    expect(feature.setup).toHaveBeenCalledTimes(1);
    expect(DebugToolkit.features.map((f) => f.name)).toEqual(['custom']);

    DebugToolkit.removeFeature('custom');
    expect(feature.cleanup).toHaveBeenCalledTimes(1);
    expect(DebugToolkit.features).toEqual([]);
  });

  it('replaces an existing feature with the same name', () => {
    const first = createFeature('custom');
    const second = createFeature('custom');

    DebugToolkit.addFeature(first);
    DebugToolkit.addFeature(second);

    expect(first.cleanup).toHaveBeenCalledTimes(1);
    expect(second.setup).toHaveBeenCalledTimes(1);
    expect(DebugToolkit.features).toEqual([second]);
  });

  it('uses launcher visibility names for the floating entry', () => {
    DebugToolkit.hideLauncher();
    expect(DebugToolkit.launcherVisible).toBe(false);

    DebugToolkit.showLauncher();
    expect(DebugToolkit.launcherVisible).toBe(true);

    DebugToolkit.hideLauncher();
    expect(DebugToolkit.launcherVisible).toBe(false);
  });

  it('does not expose legacy panel visibility aliases', () => {
    expect('panelVisible' in DebugToolkit).toBe(false);
    expect('showPanel' in DebugToolkit).toBe(false);
    expect('hidePanel' in DebugToolkit).toBe(false);
  });
});

describe('DebugToolkit panel open API', () => {
  afterEach(() => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('opens and closes panel', () => {
    expect(DebugToolkit.panelOpen).toBe(false);
    DebugToolkit.openPanel();
    expect(DebugToolkit.panelOpen).toBe(true);
    DebugToolkit.closePanel();
    expect(DebugToolkit.panelOpen).toBe(false);
  });

  it('togglePanel switches state', () => {
    expect(DebugToolkit.panelOpen).toBe(false);
    DebugToolkit.togglePanel();
    expect(DebugToolkit.panelOpen).toBe(true);
    DebugToolkit.togglePanel();
    expect(DebugToolkit.panelOpen).toBe(false);
  });

  it('openPanel is no-op when disabled', () => {
    DebugToolkit.setEnabled(false);
    DebugToolkit.openPanel();
    expect(DebugToolkit.panelOpen).toBe(false);
  });

  it('openPanel is no-op when already open', () => {
    DebugToolkit.openPanel();
    const listener = jest.fn();
    DebugToolkit.subscribe(listener);
    DebugToolkit.openPanel();
    expect(listener).not.toHaveBeenCalled();
  });

  it('closePanel is no-op when already closed', () => {
    const listener = jest.fn();
    DebugToolkit.subscribe(listener);
    DebugToolkit.closePanel();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reset clears panelOpen', () => {
    DebugToolkit.openPanel();
    DebugToolkit.reset();
    expect(DebugToolkit.panelOpen).toBe(false);
  });
});
