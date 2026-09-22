import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { createTabsFeature } from '../../src/features/tabs';
import { TabsTab } from '../../src/features/tabs/TabsTab';
import { CopyButton, CopyActionContext } from '../../src/ui/shared/CopyButton';
import { copyToComputer } from '../../src/utils/copyToComputer';

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
    { id: 'plain', title: 'Plain', onActivate: activate, onDeactivate: deactivate, component: (props: {}) => {
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
  feature.start(ctx());
  let tree: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<Host feature={feature} />); });
  expect(JSON.stringify(tree!.toJSON())).toContain('render failed');
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
