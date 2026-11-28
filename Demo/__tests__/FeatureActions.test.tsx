import React from 'react';
import { act, create } from 'react-test-renderer';
import { FloatPanelView } from '../../src/ui/panel/FloatPanelView';
import type { AnyDebugFeature } from '../../src/types';

function page(name: string): AnyDebugFeature {
  return {
    name, label: name, status: { phase: 'ready', issues: [] },
    setup() {}, cleanup() {}, getSnapshot: () => null,
  };
}

test('an action between pages closes the panel without changing the selected page', async () => {
  const select = jest.fn();
  const close = jest.fn();
  const features = [page('first'), { ...page('launch'), action: true, onSelect: select }, page('last')];
  let tree!: ReturnType<typeof create>;
  let frame: Parameters<typeof requestAnimationFrame>[0] | undefined;
  try {
    await act(async () => {
      tree = create(<FloatPanelView features={features} panelOpen onOpenPanel={() => {}} onClosePanel={close} onClearAll={() => {}} />);
    });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-last' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-last' }).length).toBeGreaterThan(0);
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-launch' }).props.onPress(); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ testID: 'debug-tab-launch' }).props.accessibilityState.selected).toBe(false);
    expect(tree.root.findAllByProps({ testID: 'debug-page-last' }).length).toBeGreaterThan(0);
    await act(async () => { frame?.(0); });
    expect(select).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { tree?.unmount(); });
    jest.restoreAllMocks();
  }
});

test.each(['error', 'unavailable'] as const)('an action in %s shows its issue instead of running', async phase => {
  const select = jest.fn();
  const close = jest.fn();
  const features: AnyDebugFeature[] = [page('first'), {
    ...page('launch'), action: true, onSelect: select,
    status: { phase, issues: [{ path: 'launch', message: 'Cannot start' }] },
  }];
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => {
      tree = create(<FloatPanelView features={features} panelOpen onOpenPanel={() => {}} onClosePanel={close} onClearAll={() => {}} />);
    });
    expect(tree.root.findByProps({ testID: 'debug-tab-launch' }).props.disabled).toBe(false);
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-launch' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-launch' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('launch: Cannot start');
    expect(select).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  } finally {
    await act(async () => { tree?.unmount(); });
  }
});
