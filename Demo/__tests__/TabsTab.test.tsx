import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
const { createTabsFeature }: typeof import('../node_modules/react-native-debug-toolkit/lib/typescript/src/features/tabs') = require('../node_modules/react-native-debug-toolkit/lib/commonjs/features/tabs');
const { TabsTab }: typeof import('../node_modules/react-native-debug-toolkit/lib/typescript/src/features/tabs/TabsTab') = require('../node_modules/react-native-debug-toolkit/lib/commonjs/features/tabs/TabsTab');
const { CopyButton, CopyActionContext }: typeof import('../node_modules/react-native-debug-toolkit/lib/typescript/src/ui/shared/CopyButton') = require('../node_modules/react-native-debug-toolkit/lib/commonjs/ui/shared/CopyButton');
const { copyToComputer }: typeof import('../node_modules/react-native-debug-toolkit/lib/typescript/src/utils/copyToComputer') = require('../node_modules/react-native-debug-toolkit/lib/commonjs/utils/copyToComputer');
import type { CopyResult } from 'react-native-debug-toolkit';

const ctx = () => ({ owner: Symbol(), signal: new AbortController().signal, isCurrent: () => true, setStatus: jest.fn() });
function Host({ feature }: { feature: ReturnType<typeof createTabsFeature> }) {
  const snapshot = useSyncExternalStore(feature.subscribe!, feature.getSnapshot);
  return <TabsTab feature={feature} snapshot={snapshot} />;
}
function select(root: Renderer.ReactTestInstance, id: string) {
  root.findByProps({ testID: `custom-tab-${id}` }).props.onPress();
}
test('empty configuration renders a normal empty page', () => {
  const feature = createTabsFeature(); feature.start(ctx());
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<Host feature={feature} />); });
  expect(JSON.stringify(tree!.toJSON())).toContain('No custom pages');
  act(() => { tree!.unmount(); feature.dispose(); });
});

test('mixed components receive only declared props; selection unmounts components without restarting runtime', () => {
  let value = 1;
  const listeners = new Set<() => void>();
  const release = jest.fn(); const deactivate = jest.fn(); const activate = jest.fn();
  const unmount = jest.fn(); const plainProps = jest.fn();
  const feature = createTabsFeature({ items: [
    { id: 'plain', title: 'Plain', onActivate: activate, onDeactivate: deactivate, component: function Plain(props: {}) {
      plainProps(props); useEffect(() => unmount, []); return <Text>Plain content</Text>;
    } },
    { id: 'data', title: 'Data', source: { getSnapshot: () => value, subscribe: (notify: () => void) => {
      listeners.add(notify); return () => { listeners.delete(notify); release(); };
    } }, component: ({ snapshot }: { snapshot: number }) => <Text>Value {snapshot}</Text> },
  ] });
  feature.start(ctx());
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<Host feature={feature} />); });
  expect(plainProps).toHaveBeenLastCalledWith({});
  act(() => { select(tree!.root, 'data'); });
  expect(unmount).toHaveBeenCalledTimes(1);
  act(() => { value = 2; listeners.forEach(fn => fn()); });
  expect(JSON.stringify(tree!.toJSON())).toContain('2');
  act(() => { select(tree!.root, 'plain'); select(tree!.root, 'data'); });
  expect(activate).toHaveBeenCalledTimes(1); expect(deactivate).not.toHaveBeenCalled();
  act(() => { tree!.unmount(); feature.dispose(); feature.dispose(); });
  expect(release).toHaveBeenCalledTimes(1); expect(deactivate).toHaveBeenCalledTimes(1);
});

test('component failures are contained and another custom page stays usable', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const feature = createTabsFeature({ items: [
    { id: 'bad', title: 'Bad', component: () => { throw new Error('render failed'); } },
    { id: 'good', title: 'Good', component: () => <Text>Still usable</Text> },
  ] });
  const context = ctx();
  feature.start(context);
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<Host feature={feature} />); });
  expect(JSON.stringify(tree!.toJSON())).toContain('render failed');
  expect(context.setStatus).toHaveBeenLastCalledWith({ phase: 'ready', issues: [] });
  act(() => { select(tree!.root, 'good'); });
  expect(JSON.stringify(tree!.toJSON())).toContain('Still usable');
  act(() => { tree!.unmount(); feature.dispose(); }); spy.mockRestore();
});

test('business Context can bridge to a source consumed outside that provider', () => {
  const Business = createContext('default');
  let snapshot = 'initial'; const listeners = new Set<() => void>();
  const source = { getSnapshot: () => snapshot, subscribe: (notify: () => void) => {
    listeners.add(notify); return () => listeners.delete(notify);
  } };
  function Bridge() { const value = useContext(Business); useEffect(() => { snapshot = value; listeners.forEach(fn => fn()); }, [value]); return null; }
  const feature = createTabsFeature({ items: [{ id: 'context', title: 'Context', source, component: ({ snapshot: value }: { snapshot: string }) => <Text>{value}</Text> }] });
  feature.start(ctx());
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<><Business.Provider value="business value"><Bridge /></Business.Provider><Host feature={feature} /></>); });
  expect(JSON.stringify(tree!.toJSON())).toContain('business value');
  act(() => { tree!.unmount(); feature.dispose(); });
});

test('copy feedback displays separate channel failures and unavailable reasons', async () => {
  const recordConsole = jest.fn();
  const copy = (text: string) => copyToComputer(text, { enabled: true, channels: {
    copyPhone: () => { throw new Error('Phone denied'); }, recordConsole,
    sendHub: async () => 'unavailable',
  } });
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<CopyActionContext.Provider value={copy}><CopyButton text="hello" /></CopyActionContext.Provider>); });
  expect(recordConsole).not.toHaveBeenCalled();
  await act(async () => { await tree!.root.find(node => typeof node.props.onPress === 'function').props.onPress(); });
  const output = JSON.stringify(tree!.toJSON());
  expect(output).toContain('Phone: error (Phone denied)');
  expect(output).toContain('Console: success');
  expect(output).toContain('Hub: unavailable (Computer delivery was not confirmed.)');
  expect(recordConsole).toHaveBeenCalledTimes(1);
  act(() => { tree!.unmount(); });
});

test('editing text discards a pending result without releasing a newer copy action', async () => {
  const result: CopyResult = { status: 'completed', phone: { status: 'success' }, console: { status: 'success' }, hub: { status: 'success' } };
  const resolvers: ((value: CopyResult) => void)[] = [];
  const copy = jest.fn(() => new Promise<CopyResult>(resolve => { resolvers.push(resolve); }));
  let tree: Renderer.ReactTestRenderer;
  let oldRequest: Promise<void>;
  let newRequest: Promise<void>;
  const button = () => tree!.root.find(node => typeof node.props.onPress === 'function');
  act(() => { tree = Renderer.create(<CopyButton text="old text" copy={copy} />); });
  act(() => { oldRequest = button().props.onPress(); });
  act(() => { tree!.update(<CopyButton text="new text" copy={copy} />); });
  expect(button().props.disabled).toBe(false);
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Phone: success');
  act(() => { newRequest = button().props.onPress(); });
  await act(async () => { resolvers[0]!(result); await oldRequest!; });
  expect(button().props.disabled).toBe(true);
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Phone: success');
  await act(async () => { resolvers[1]!(result); await newRequest!; });
  expect(button().props.disabled).toBe(false);
  expect(JSON.stringify(tree!.toJSON())).toContain('Phone: success');
  expect(copy.mock.calls).toHaveLength(2);
  act(() => { tree!.unmount(); });
});

test('editing after success clears the previous text feedback', async () => {
  const copy = (text: string) => copyToComputer(text, { enabled: true, channels: { copyPhone: () => {} } });
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<CopyButton text="old text" copy={copy} />); });
  await act(async () => { await tree!.root.find(node => typeof node.props.onPress === 'function').props.onPress(); });
  expect(JSON.stringify(tree!.toJSON())).toContain('Phone: success');
  act(() => { tree!.update(<CopyButton text="new text" copy={copy} />); });
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Phone: success');
  act(() => { tree!.unmount(); });
});

test('replacing the copy action discards its previous pending completion', async () => {
  let resolve!: (value: CopyResult) => void;
  const oldCopy = () => new Promise<CopyResult>(done => { resolve = done; });
  const newCopy = (text: string) => copyToComputer(text, { enabled: true, channels: {} });
  let tree: Renderer.ReactTestRenderer;
  let pending!: Promise<void>;
  act(() => { tree = Renderer.create(<CopyButton text="same text" copy={oldCopy} />); });
  act(() => { pending = tree!.root.find(node => typeof node.props.onPress === 'function').props.onPress(); });
  act(() => { tree!.update(<CopyButton text="same text" copy={newCopy} />); });
  await act(async () => {
    resolve({ status: 'completed', phone: { status: 'success' }, console: { status: 'success' }, hub: { status: 'success' } });
    await pending;
  });
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Phone: success');
  act(() => { tree!.unmount(); });
});
