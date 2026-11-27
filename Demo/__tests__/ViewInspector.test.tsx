import React from 'react';
import { NativeModules } from 'react-native';
import { act, create } from 'react-test-renderer';
import { debug, withDebugToolkit } from 'react-native-debug-toolkit';

jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: () => undefined, set: () => undefined, remove: () => true,
}) }), { virtual: true });

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
