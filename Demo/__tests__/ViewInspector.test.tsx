import React from 'react';
import { NativeModules } from 'react-native';
import { act, create } from 'react-test-renderer';
import { debug, withDebugToolkit } from 'react-native-debug-toolkit';

const mockValues = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: (key: string) => mockValues.get(key),
  set: (key: string, value: string) => { mockValues.set(key, value); },
  remove: (key: string) => mockValues.delete(key),
}) }), { virtual: true });

afterEach(() => { mockValues.clear(); });

const disabledPages = {
  network: { enabled: false }, console: { enabled: false }, native: { enabled: false },
  state: { enabled: false }, navigation: { enabled: false }, track: { enabled: false },
  connect: { enabled: false }, clipboard: { enabled: false }, history: { enabled: false },
  environment: { enabled: false }, accounts: { enabled: false }, tabs: { enabled: false },
};

test('view inspector follows app logs and opens after the panel closes', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const show = jest.fn(async () => 'opened');
  NativeModules.DebugToolkitViewInspector = { show };
  const Wrapped = withDebugToolkit(() => null, {
    enabled: true,
    logChannels: [{ id: 'app', title: '应用' }],
    viewInspector: true,
  });
  let tree!: ReturnType<typeof create>;
  let frame: Parameters<typeof requestAnimationFrame>[0] | undefined;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); debug.open(); });
    const tabs = [...new Set(tree.root.findAllByProps({ accessibilityRole: 'tab' }).map(tab => tab.props.testID))];
    expect(tabs.indexOf('debug-tab-viewInspector')).toBe(tabs.indexOf('debug-tab-channel.app') + 1);
    const requestFrame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
      frame = callback;
      return 1;
    });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-viewInspector' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'debug-tab-viewInspector' })).toHaveLength(0);
    expect(show).not.toHaveBeenCalled();
    await act(async () => { frame?.(0); });
    expect(show).toHaveBeenCalledTimes(1);
    requestFrame.mockRestore();
  } finally {
    await act(async () => { tree?.unmount(); });
    delete NativeModules.DebugToolkitViewInspector;
    jest.restoreAllMocks();
  }
});


test('inspector alone renders the launcher and opens after selecting the action', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const show = jest.fn(async () => 'opened');
  NativeModules.DebugToolkitViewInspector = { show };
  const Wrapped = withDebugToolkit(() => null, { enabled: true, locale: 'en', ...disabledPages, viewInspector: { enabled: true } });
  let tree!: ReturnType<typeof create>;
  let frame: Parameters<typeof requestAnimationFrame>[0] | undefined;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); });
    const launcher = tree.root.findByProps({ testID: 'debug-toolkit-launcher' });
    await act(async () => { launcher.props.onAccessibilityTap(); });
    expect(tree.root.findAllByProps({ children: 'Select an action from the sidebar.' }).length).toBeGreaterThan(0);
    const action = tree.root.findByProps({ testID: 'debug-tab-viewInspector' });
    expect(action.props.accessibilityState.selected).toBe(false);
    expect(tree.root.findAllByProps({ testID: 'debug-page-viewInspector' })).toHaveLength(0);
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    await act(async () => { action.props.onPress(); });
    expect(show).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'debug-tab-viewInspector' })).toHaveLength(0);
    await act(async () => { frame?.(0); });
    expect(show).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => { tree?.unmount(); });
    delete NativeModules.DebugToolkitViewInspector;
    jest.restoreAllMocks();
  }
});

test('inspector configuration errors are visible when it is the only feature', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const show = jest.fn(async () => 'opened');
  NativeModules.DebugToolkitViewInspector = { show };
  const Wrapped = withDebugToolkit(() => null, {
    enabled: true, locale: 'en', ...disabledPages, viewInspector: { enabled: 'yes' },
  } as never);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { expect((await debug.ready()).status).toBe('partial'); debug.open(); });
    expect(tree.root.findByProps({ testID: 'debug-tab-viewInspector' }).props.disabled).toBe(false);
    expect(tree.root.findAllByProps({ testID: 'debug-page-viewInspector' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('viewInspector.enabled: Invalid configuration value.');
    expect(JSON.stringify(tree.toJSON())).not.toContain('Select an action from the sidebar.');
    expect(show).not.toHaveBeenCalled();
  } finally {
    await act(async () => { tree?.unmount(); });
    delete NativeModules.DebugToolkitViewInspector;
  }
});

test('opening an invalid inspector by name displays the error and keeps other features running', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const show = jest.fn(async () => 'opened');
  NativeModules.DebugToolkitViewInspector = { show };
  const Wrapped = withDebugToolkit(() => null, {
    enabled: true, ...disabledPages, track: {}, viewInspector: null,
  } as never);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { expect((await debug.ready()).status).toBe('partial'); debug.open('viewInspector'); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-viewInspector' }).length).toBeGreaterThan(0);
    expect(JSON.stringify(tree.toJSON())).toContain('viewInspector: Expected a boolean or feature configuration object.');
    expect(show).not.toHaveBeenCalled();
    debug.track('still-works');
    expect(debug.getReport().logs.track).toHaveLength(1);
  } finally {
    await act(async () => { tree?.unmount(); });
    delete NativeModules.DebugToolkitViewInspector;
  }
});

test('opening the action by name waits for its feature to initialize', async () => {
  let finishDetection!: (debugBuild: boolean) => void;
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: () => new Promise(resolve => { finishDetection = resolve; }) };
  const show = jest.fn(async () => 'opened');
  NativeModules.DebugToolkitViewInspector = { show };
  const Wrapped = withDebugToolkit(() => null, { enabled: true, ...disabledPages, viewInspector: true });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { debug.open('viewInspector'); });
    expect(tree.root.findByProps({ testID: 'debug-tab-viewInspector' }).props.disabled).toBe(true);
    expect(show).not.toHaveBeenCalled();
    await act(async () => { finishDetection(true); await debug.ready(); });
    await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 20)); });
    expect(show).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByProps({ testID: 'debug-tab-viewInspector' })).toHaveLength(0);
  } finally {
    await act(async () => { tree?.unmount(); });
    delete NativeModules.DebugToolkitViewInspector;
  }
});

test('selecting the inspector keeps the current custom tab and its saved preference', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  NativeModules.DebugToolkitViewInspector = { show: jest.fn(async () => 'opened') };
  const Wrapped = withDebugToolkit(() => null, {
    enabled: true, viewInspector: true,
    tabs: { items: [{ id: 'my-page', title: 'My page', component: () => null }] },
  });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); debug.open(); });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-tabs' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'custom-tab-my-page' }).length).toBeGreaterThan(0);
    expect(mockValues.get('@react_native_debug_toolkit/last_tab')).toBe('tabs');
    let frame: Parameters<typeof requestAnimationFrame>[0] | undefined;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-viewInspector' }).props.onPress(); });
    await act(async () => { frame?.(0); });
    expect(mockValues.get('@react_native_debug_toolkit/last_tab')).toBe('tabs');
    await act(async () => { tree.unmount(); });
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); debug.open(); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-tabs' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ testID: 'custom-tab-my-page' }).length).toBeGreaterThan(0);
    expect(mockValues.get('@react_native_debug_toolkit/last_tab')).toBe('tabs');
  } finally {
    await act(async () => { tree?.unmount(); });
    delete NativeModules.DebugToolkitViewInspector;
    jest.restoreAllMocks();
  }
});
