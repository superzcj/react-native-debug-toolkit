import React from 'react';
import { NativeModules } from 'react-native';
import { act, create } from 'react-test-renderer';
import { withDebugToolkit, debug } from 'react-native-debug-toolkit';
import ZeroConfigApp from '../ZeroConfigApp';
import type { ToolkitHost } from '../node_modules/react-native-debug-toolkit/lib/typescript/src/core/DebugToolkit';
// White-box fault injection uses the installed build, sharing the public host.
const { getActiveRuntime }: typeof import('../node_modules/react-native-debug-toolkit/lib/typescript/src/core/host') = require('../node_modules/react-native-debug-toolkit/lib/commonjs/core/host');

jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: () => undefined, set: () => undefined, remove: () => true,
}) }), { virtual: true });

test('every default page really opens with zero business inputs', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ZeroConfigApp />); });
    await act(async () => { await debug.ready(); debug.open(); });
    const defaultPages = ['network', 'console', 'native', 'state', 'navigation', 'track',
      'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs'];
    expect(Object.keys(debug.getReport().features).sort()).toEqual([...defaultPages].sort());
    for (const key of defaultPages) {
      const tab = tree.root.findByProps({ testID: `debug-tab-${key}` });
      await act(async () => { tab.props.onPress(); });
      expect(tree.root.findAllByProps({ testID: `debug-page-${key}` }).length).toBeGreaterThan(0);
    }
    expect(debug.getReport().features).toMatchObject({
      state: { phase: 'empty' }, navigation: { phase: 'empty' }, track: { phase: 'empty' },
      environment: { phase: 'empty' }, accounts: { phase: 'empty' }, tabs: { phase: 'empty' },
    });
  } finally { await act(async () => { tree?.unmount(); }); }
});

test('invalid feature configuration has a visible path and leaves eleven usable pages', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const Wrapped = withDebugToolkit(() => null, { network: { maxLogs: 0 } });
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); debug.open(); });
    expect(Object.keys(debug.getReport().features)).toHaveLength(12);
    expect(JSON.stringify(tree.toJSON())).toContain('network.maxLogs');
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-accounts' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-accounts' }).length).toBeGreaterThan(0);
  } finally { await act(async () => { tree?.unmount(); }); }
});

test('a rendering error stays in its feature and the sibling pages remain selectable', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const Wrapped = withDebugToolkit(() => null);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); });
    const host = getActiveRuntime() as ToolkitHost;
    host.features.find(feature => feature.name === 'state')!.renderContent = () => { throw new Error('broken state view'); };
    await act(async () => { debug.open(); });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-state' }).props.onPress(); });
    expect(JSON.stringify(tree.toJSON())).toContain('state.render: broken state view');
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-accounts' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-accounts' }).length).toBeGreaterThan(0);
  } finally { await act(async () => { tree?.unmount(); }); errors.mockRestore(); }
});

test('a snapshot error stays visible in its feature while sibling pages remain selectable', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const Wrapped = withDebugToolkit(() => null);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); });
    const host = getActiveRuntime() as ToolkitHost;
    host.features.find(feature => feature.name === 'state')!.getSnapshot = () => { throw new Error('broken state snapshot'); };
    await act(async () => { debug.open(); });
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-state' }).props.onPress(); });
    expect(JSON.stringify(tree.toJSON())).toContain('state.snapshot: broken state snapshot');
    await act(async () => { tree.root.findByProps({ testID: 'debug-tab-accounts' }).props.onPress(); });
    expect(tree.root.findAllByProps({ testID: 'debug-page-accounts' }).length).toBeGreaterThan(0);
  } finally { await act(async () => { tree?.unmount(); }); errors.mockRestore(); }
});
