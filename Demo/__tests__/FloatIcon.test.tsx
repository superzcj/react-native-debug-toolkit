import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import * as RN from 'react-native';
import { FloatIcon } from '../../src/ui/floating/FloatIcon';
import { QuickActionsMenu } from '../../src/ui/floating/QuickActionsMenu';

type Responder = {
  onPanResponderGrant: () => void;
  onPanResponderMove: (event: unknown, gesture: { dx: number; dy: number }) => void;
  onPanResponderRelease: (event: unknown, gesture: { dx: number; dy: number }) => void;
};

const action = (id: string, onPress: () => void | Promise<void>, extra: Record<string, unknown> = {}) => ({
  id, title: id, onPress, ...extra,
});

function responder(tree: ReactTestRenderer.ReactTestRenderer): Responder {
  const props = tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props;
  return { onPanResponderGrant: props.onPanResponderGrant, onPanResponderMove: props.onPanResponderMove,
    onPanResponderRelease: props.onPanResponderRelease };
}

function render(actions: readonly ReturnType<typeof action>[]) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <FloatIcon visible onPress={jest.fn()} badge={null} quickActions={actions} />,
    );
  });
  return tree;
}

beforeEach(() => {
  jest.useFakeTimers();
  (global as unknown as { __lastPanResponder?: Responder }).__lastPanResponder = undefined;
});

afterEach(() => { jest.useRealTimers(); });

test('opens after a long press and release leaves the radial menu open', async () => {
  const tree = render([action('cart', jest.fn()), action('refresh', jest.fn())]);
  await act(async () => {
    responder(tree).onPanResponderGrant();
    jest.advanceTimersByTime(449);
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');

  await act(async () => { jest.advanceTimersByTime(1); });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('box-none');
  await act(async () => { responder(tree).onPanResponderRelease({}, { dx: 0, dy: 0 }); });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('box-none');
  act(() => { tree.unmount(); });
});

test('movement cancels long press and continues as a drag', async () => {
  const tree = render([action('cart', jest.fn())]);
  await act(async () => {
    responder(tree).onPanResponderGrant();
    responder(tree).onPanResponderMove({}, { dx: 8, dy: 0 });
    jest.advanceTimersByTime(500);
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  await act(async () => { responder(tree).onPanResponderRelease({}, { dx: 8, dy: 0 }); });
  act(() => { tree.unmount(); });
});

test('disabled actions do not execute and closeOnPress closes before async work starts', async () => {
  const disabled = jest.fn();
  const callback = jest.fn(async () => undefined);
  const tree = render([
    action('disabled', disabled, { disabled: true }),
    action('save', callback),
  ]);
  await act(async () => {
    responder(tree).onPanResponderGrant();
    jest.advanceTimersByTime(450);
  });
  await act(async () => { tree.root.findByProps({ testID: 'quick-action-disabled' }).props.onPress(); });
  expect(disabled).not.toHaveBeenCalled();
  await act(async () => { tree.root.findByProps({ testID: 'quick-action-save' }).props.onPress(); });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  await act(async () => { await Promise.resolve(); });
  expect(callback).toHaveBeenCalledTimes(1);
  act(() => { tree.unmount(); });
});

test('closeOnPress false prevents duplicate starts and reports async failure in the open menu', async () => {
  let reject!: (error: Error) => void;
  const callback = jest.fn(() => new Promise<void>((_resolve, nextReject) => { reject = nextReject; }));
  const tree = render([action('sync', callback, { closeOnPress: false })]);
  await act(async () => {
    responder(tree).onPanResponderGrant();
    jest.advanceTimersByTime(450);
  });
  await act(async () => {
    tree.root.findByProps({ testID: 'quick-action-sync' }).props.onPress();
    tree.root.findByProps({ testID: 'quick-action-sync' }).props.onPress();
  });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(tree.root.findByProps({ testID: 'quick-action-spinner-sync' })).toBeTruthy();
  await act(async () => { reject(new Error('failed')); await Promise.resolve(); await Promise.resolve(); });
  expect(tree.root.findByProps({ testID: 'quick-action-feedback' })).toBeTruthy();
  expect(JSON.stringify(tree.toJSON())).toContain('Action failed');
  act(() => { tree.unmount(); });
});

test('Android back closes an open menu without invoking the panel opener', async () => {
  const onPress = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <FloatIcon visible onPress={onPress} badge={null} quickActions={[action('cart', jest.fn())]} />,
    );
  });
  await act(async () => {
    responder(tree).onPanResponderGrant();
    jest.advanceTimersByTime(450);
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('box-none');
  await act(async () => {
    (BackHandler as unknown as { __emitBack: () => boolean }).__emitBack();
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  expect(onPress).not.toHaveBeenCalled();
  act(() => { tree.unmount(); });
});

test('closed quick actions do not leave a dimming layer over the business app', () => {
  const tree = render([action('cart', jest.fn())]);
  expect(tree.root.findAllByProps({ testID: 'quick-actions-backdrop' })).toHaveLength(0);
  act(() => tree.unmount());
});

test('tapping the center closes a menu opened by a previous long press', async () => {
  const tree = render([action('cart', jest.fn())]);
  await act(async () => {
    responder(tree).onPanResponderGrant();
    jest.advanceTimersByTime(450);
    responder(tree).onPanResponderRelease({}, { dx: 0, dy: 0 });
  });
  await act(async () => {
    responder(tree).onPanResponderGrant();
    responder(tree).onPanResponderRelease({}, { dx: 0, dy: 0 });
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  act(() => tree.unmount());
});

test('dragging away and returning to the starting point does not click the panel', async () => {
  const onPress = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<FloatIcon visible onPress={onPress} badge={null} />); });
  act(() => {
    responder(tree).onPanResponderGrant();
    responder(tree).onPanResponderMove({}, { dx: 20, dy: 0 });
    responder(tree).onPanResponderRelease({}, { dx: 0, dy: 0 });
  });
  expect(onPress).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

test('applies a drag delta to the asynchronously stopped native position', async () => {
  const Value = RN.Animated.Value as unknown as { prototype: { stopAnimation: (callback?: (value: number) => void) => void } };
  const originalStopAnimation = Value.prototype.stopAnimation;
  const axisCallbacks: Array<(value: number) => void> = [];
  Value.prototype.stopAnimation = function stopAnimation(callback) {
    if (callback) axisCallbacks.push(callback);
  };
  try {
    const tree = render([]);
    await act(async () => {
      responder(tree).onPanResponderGrant();
      responder(tree).onPanResponderMove({}, { dx: 20, dy: 10 });
    });
    expect(axisCallbacks).toHaveLength(2);
    await act(async () => {
      axisCallbacks[0]!(210);
      axisCallbacks[1]!(310);
    });
    const transform = tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props.style[1].transform;
    expect(transform[0].translateX.value).toBe(230);
    expect(transform[1].translateY.value).toBe(320);
    act(() => tree.unmount());
  } finally {
    Value.prototype.stopAnimation = originalStopAnimation;
  }
});

test('uses both stopped native axes as the quick-actions origin after a delayed read', async () => {
  const Value = RN.Animated.Value as unknown as { prototype: { stopAnimation: (callback?: (value: number) => void) => void } };
  const originalStopAnimation = Value.prototype.stopAnimation;
  const axisCallbacks: Array<(value: number) => void> = [];
  Value.prototype.stopAnimation = function stopAnimation(callback) {
    if (callback) axisCallbacks.push(callback);
  };
  try {
    const tree = render([action('cart', jest.fn())]);
    await act(async () => {
      responder(tree).onPanResponderGrant();
      jest.advanceTimersByTime(450);
    });
    expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
    await act(async () => {
      axisCallbacks[0]!(210);
      axisCallbacks[1]!(310);
    });
    expect(tree.root.findByType(QuickActionsMenu).props.origin).toEqual({ x: 210, y: 310 });
    act(() => tree.unmount());
  } finally {
    Value.prototype.stopAnimation = originalStopAnimation;
  }
});

test('late native axis callbacks cannot resurrect a released or resized gesture', async () => {
  const Value = RN.Animated.Value as unknown as { prototype: { stopAnimation: (callback?: (value: number) => void) => void } };
  const originalStopAnimation = Value.prototype.stopAnimation;
  const axisCallbacks: Array<(value: number) => void> = [];
  Value.prototype.stopAnimation = function stopAnimation(callback) {
    if (callback) axisCallbacks.push(callback);
  };
  try {
    const tree = render([]);
    await act(async () => {
      responder(tree).onPanResponderGrant();
      responder(tree).onPanResponderMove({}, { dx: 24, dy: 0 });
      responder(tree).onPanResponderRelease({}, { dx: 24, dy: 0 });
    });
    await act(async () => {
      tree.root.findByProps({ testID: 'quick-actions-viewport' }).props.onLayout({
        nativeEvent: { layout: { width: 320, height: 400 } },
      });
    });
    const beforeTransform = tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props.style[1].transform;
    const beforeLateCallbacks = { x: beforeTransform[0].translateX.value, y: beforeTransform[1].translateY.value };
    expect(axisCallbacks).toHaveLength(2);
    await act(async () => {
      axisCallbacks.forEach((callback, index) => callback(index === 0 ? 300 : 400));
    });
    const afterLateCallbacks = tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props.style[1].transform;
    expect(afterLateCallbacks[0].translateX.value).toBe(beforeLateCallbacks.x);
    expect(afterLateCallbacks[1].translateY.value).toBe(beforeLateCallbacks.y);
    act(() => tree.unmount());
  } finally {
    Value.prototype.stopAnimation = originalStopAnimation;
  }
});

test('a terminated long press cannot open the menu when native coordinates arrive later', async () => {
  const callbacks: Array<(value: number) => void> = [];
  const stop = jest.spyOn(RN.Animated.Value.prototype, 'stopAnimation').mockImplementation(callback => {
    if (callback) callbacks.push(callback);
  });
  const tree = render([action('cart', jest.fn())]);
  try {
    await act(async () => {
      responder(tree).onPanResponderGrant();
      jest.advanceTimersByTime(450);
      tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props.onPanResponderTerminate({}, { dx: 0, dy: 0 });
      callbacks[0]!(210);
      callbacks[1]!(310);
    });
    expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  } finally {
    act(() => tree.unmount());
    stop.mockRestore();
  }
});

test('a drag released before native coordinates arrive snaps from the actual stopped position', async () => {
  const callbacks: Array<(value: number) => void> = [];
  const stop = jest.spyOn(RN.Animated.Value.prototype, 'stopAnimation').mockImplementation(callback => {
    if (callback) callbacks.push(callback);
  });
  const tree = render([]);
  try {
    await act(async () => {
      responder(tree).onPanResponderGrant();
      responder(tree).onPanResponderMove({}, { dx: 20, dy: 10 });
      responder(tree).onPanResponderRelease({}, { dx: 20, dy: 10 });
      callbacks[1]!(310);
      callbacks[0]!(50);
    });
    expect(tree.root.findByType(QuickActionsMenu).props.origin).toEqual({ x: 16, y: 320 });
  } finally {
    act(() => tree.unmount());
    stop.mockRestore();
  }
});

test('native coordinate callbacks from a previous gesture cannot overwrite a newer drag', async () => {
  const callbacks: Array<(value: number) => void> = [];
  const stop = jest.spyOn(RN.Animated.Value.prototype, 'stopAnimation').mockImplementation(callback => {
    if (callback) callbacks.push(callback);
  });
  const tree = render([]);
  try {
    await act(async () => {
      responder(tree).onPanResponderGrant();
      responder(tree).onPanResponderMove({}, { dx: 20, dy: 10 });
      responder(tree).onPanResponderRelease({}, { dx: 20, dy: 10 });
      responder(tree).onPanResponderGrant();
      responder(tree).onPanResponderMove({}, { dx: 30, dy: 20 });
      callbacks[2]!(100);
      callbacks[3]!(200);
      callbacks[0]!(250);
      callbacks[1]!(350);
    });
    const transform = tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props.style[1].transform;
    expect(transform[0].translateX.value).toBe(130);
    expect(transform[1].translateY.value).toBe(220);
  } finally {
    act(() => tree.unmount());
    stop.mockRestore();
  }
});

test('resizing preserves long press and uses the latest bounds for subsequent dragging', async () => {
  const dimensions = jest.spyOn(RN, 'useWindowDimensions');
  const actions = [action('cart', jest.fn())];
  const tree = render(actions);
  dimensions.mockReturnValue({ width: 844, height: 390, scale: 1, fontScale: 1 });
  await act(async () => { tree.update(<FloatIcon visible onPress={jest.fn()} badge={null} quickActions={actions} />); });
  await act(async () => {
    responder(tree).onPanResponderGrant();
    jest.advanceTimersByTime(450);
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('box-none');
  act(() => tree.unmount());
  dimensions.mockRestore();
});

test('opening the full panel hides and releases the quick-actions overlay', async () => {
  const actions = [action('cart', jest.fn())];
  const tree = render(actions);
  await act(async () => { responder(tree).onPanResponderGrant(); jest.advanceTimersByTime(450); });
  await act(async () => { tree.update(<FloatIcon visible={false} onPress={jest.fn()} badge={null} quickActions={actions} />); });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  act(() => tree.unmount());
});

test('character icons are rendered in Text rather than as native View text children', async () => {
  const tree = render([action('cart', jest.fn(), { icon: '↺' })]);
  await act(async () => { responder(tree).onPanResponderGrant(); jest.advanceTimersByTime(450); });
  const views = tree.root.findAll(node => typeof node.type === 'string' && String(node.type) === 'View');
  expect(views.some((view) => view.children.some((child) => typeof child === 'string'))).toBe(false);
  act(() => tree.unmount());
});

test('feedback expires instead of covering business content indefinitely', async () => {
  const tree = render([action('cart', jest.fn(), { closeOnPress: false })]);
  await act(async () => { responder(tree).onPanResponderGrant(); jest.advanceTimersByTime(450); });
  await act(async () => { tree.root.findByProps({ testID: 'quick-action-cart' }).props.onPress(); });
  expect(tree.root.findAllByProps({ testID: 'quick-action-feedback' }).length).toBeGreaterThan(0);
  await act(async () => { jest.advanceTimersByTime(4000); });
  expect(tree.root.findAllByProps({ testID: 'quick-action-feedback' })).toHaveLength(0);
  act(() => tree.unmount());
});

test('navigation callback waits for exit animation and the backdrop to be removed', async () => {
  const completions: Array<(result: { finished: boolean }) => void> = [];
  const originalParallel = jest.mocked(RN.Animated.parallel).getMockImplementation()!;
  const parallel = jest.mocked(RN.Animated.parallel).mockImplementation(() => ({
    start: (done?: (result: { finished: boolean }) => void) => { if (done) completions.push(done); },
    stop: () => {},
    reset: () => {},
  }));
  const callback = jest.fn();
  const tree = render([action('navigate', callback)]);
  await act(async () => { responder(tree).onPanResponderGrant(); jest.advanceTimersByTime(450); });
  await act(async () => { tree.root.findByProps({ testID: 'quick-action-navigate' }).props.onPress(); });
  expect(callback).not.toHaveBeenCalled();
  expect(tree.root.findAllByProps({ testID: 'quick-actions-backdrop' }).length).toBeGreaterThan(0);
  await act(async () => { completions[completions.length - 1]!({ finished: true }); });
  expect(tree.root.findAllByProps({ testID: 'quick-actions-backdrop' })).toHaveLength(0);
  expect(callback).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  parallel.mockImplementation(originalParallel);
});

test('screen-reader custom action opens shortcuts without requiring a long press', async () => {
  const tree = render([action('cart', jest.fn())]);
  await act(async () => {
    tree.root.findByProps({ testID: 'debug-toolkit-launcher' }).props.onAccessibilityAction({
      nativeEvent: { actionName: 'showQuickActions' },
    });
  });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('box-none');
  act(() => tree.unmount());
});

test('measured safe content bounds constrain launcher and radial targets', async () => {
  const tree = render([action('cart', jest.fn())]);
  await act(async () => {
    tree.root.findByProps({ testID: 'quick-actions-viewport' }).props.onLayout({
      nativeEvent: { layout: { width: 320, height: 400 } },
    });
    responder(tree).onPanResponderGrant();
    responder(tree).onPanResponderMove({}, { dx: 0, dy: 500 });
    responder(tree).onPanResponderRelease({}, { dx: 0, dy: 500 });
  });
  await act(async () => { responder(tree).onPanResponderGrant(); jest.advanceTimersByTime(450); });
  const card = tree.root.findByProps({ testID: 'quick-action-card-cart' }).props.style[1];
  expect(card.left).toBeGreaterThanOrEqual(0);
  expect(card.top).toBeGreaterThanOrEqual(0);
  expect(card.left + card.width).toBeLessThanOrEqual(320);
  expect(card.top + card.height).toBeLessThanOrEqual(400);
  act(() => tree.unmount());
});

test('blank space in the scrollable narrow-screen fallback closes the menu', async () => {
  const tree = render(Array.from({ length: 5 }, (_, i) => action('a' + i, jest.fn())));
  await act(async () => {
    tree.root.findByProps({ testID: 'quick-actions-viewport' }).props.onLayout({
      nativeEvent: { layout: { width: 86, height: 100 } },
    });
  });
  await act(async () => { responder(tree).onPanResponderGrant(); jest.advanceTimersByTime(450); });
  await act(async () => { tree.root.findByProps({ testID: 'quick-actions-grid-backdrop' }).props.onPress(); });
  expect(tree.root.findByProps({ testID: 'quick-actions-menu' }).props.pointerEvents).toBe('none');
  act(() => tree.unmount());
});
