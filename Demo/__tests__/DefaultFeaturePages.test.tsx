import React from 'react';
import { NativeModules } from 'react-native';
import { act, create } from 'react-test-renderer';
import { withDebugToolkit } from '../../src/withDebugToolkit';
import { debug } from '../../src/core/debug';
import { FEATURE_KEYS } from '../../src/core/featureCatalog';
import { getActiveRuntime } from '../../src/core/host';
import type { ToolkitHost } from '../../src/core/DebugToolkit';

jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: () => undefined, set: () => undefined, remove: () => true,
}) }), { virtual: true });

test('every default page really opens with zero business inputs', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const Wrapped = withDebugToolkit(() => null);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<Wrapped />); });
    await act(async () => { await debug.ready(); debug.open(); });
    for (const key of FEATURE_KEYS) {
      const tab = tree.root.findByProps({ testID: `debug-tab-${key}` });
      await act(async () => { tab.props.onPress(); });
      expect(tree.root.findAllByProps({ testID: `debug-page-${key}` }).length).toBeGreaterThan(0);
    }
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
