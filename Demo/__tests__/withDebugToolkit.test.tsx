import React, { useEffect } from 'react';
import { NativeModules } from 'react-native';
import { act, create } from 'react-test-renderer';
const FEATURE_KEYS = ['network', 'console', 'native', 'state', 'navigation', 'track', 'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs'];

jest.mock('react-native-mmkv', () => ({ createMMKV: jest.fn(() => ({
  getString: () => undefined, set: () => undefined, remove: () => true,
})) }), { virtual: true });

// Capture before loading the HOC: its diagnostic deliberately bypasses collectors.
const diagnostics = jest.spyOn(console, 'error').mockImplementation(() => undefined);
const { withDebugToolkit, debug }: typeof import('react-native-debug-toolkit') = require('react-native-debug-toolkit');
afterAll(() => diagnostics.mockRestore());

let tree: ReturnType<typeof create> | undefined;
beforeEach(() => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: jest.fn(async () => true) };
});
afterEach(async () => { await act(async () => { tree?.unmount(); }); tree = undefined; });

test('one wrapper registers the full toolkit and preserves app props', async () => {
  const App = jest.fn((_props: { title: string }) => null);
  const Wrapped = withDebugToolkit(App);
  expect(NativeModules.DebugToolkitDevConnect.isDebugBuild).not.toHaveBeenCalled();
  await act(async () => { tree = create(<Wrapped title="shop" />); });
  await act(async () => { await debug.ready(); });
  expect(App.mock.calls[0]?.[0]).toEqual({ title: 'shop' });
  expect(Object.keys(debug.getReport().features).sort()).toEqual([...FEATURE_KEYS].sort());
  expect(Wrapped.displayName).toContain('withDebugToolkit');
});

test('a normal child effect awaits the owning ready promise before recording', async () => {
  let done: Promise<void> | undefined;
  function App() {
    useEffect(() => { done = debug.ready().then(() => { debug.track('child-ready'); }); }, []);
    return null;
  }
  const Wrapped = withDebugToolkit(App);
  await act(async () => { tree = create(<Wrapped />); });
  await act(async () => { await done; });
  expect(debug.getReport().logs.track).toEqual([expect.objectContaining({ eventName: 'child-ready' })]);
});

test('class refs reach the original app instance', async () => {
  class App extends React.Component<{ title: string }> { value() { return this.props.title; } render() { return null; } }
  const Wrapped = withDebugToolkit(App);
  const ref = React.createRef<App>();
  await act(async () => { tree = create(<Wrapped title="shop" ref={ref} />); });
  expect(ref.current?.value()).toBe('shop');
});

test('forwarded refs retain their declared handle and reach the app', async () => {
  const App = React.forwardRef<{ value(): string }, { title: string }>((props, ref) => {
    React.useImperativeHandle(ref, () => ({ value: () => props.title }), [props.title]);
    return null;
  });
  const Wrapped = withDebugToolkit(App);
  const ref = React.createRef<React.ComponentRef<typeof Wrapped>>();
  await act(async () => { tree = create(<Wrapped title="forwarded" ref={ref} />); });
  expect(ref.current?.value()).toBe('forwarded');
});

test('StrictMode cleanup and a refresh remount leave one current recorder', async () => {
  const Wrapped = withDebugToolkit(() => null);
  await act(async () => { tree = create(<React.StrictMode><Wrapped /></React.StrictMode>); });
  await act(async () => { await debug.ready(); debug.track('strict'); });
  expect(debug.getReport().logs.track).toHaveLength(1);
  await act(async () => { tree!.unmount(); });
  expect((await debug.ready()).status).toBe('not_started');
  const Refreshed = withDebugToolkit(() => null);
  await act(async () => { tree = create(<Refreshed />); });
  await act(async () => { await debug.ready(); debug.track('refresh'); });
  expect(debug.getReport().logs.track).toEqual([expect.objectContaining({ eventName: 'refresh' })]);
});

test('duplicate hosts preserve both apps and the first recorder', async () => {
  const First = withDebugToolkit(() => <>{'first-app'}</>);
  const Second = withDebugToolkit(() => <>{'second-app'}</>);
  diagnostics.mockClear();
    await act(async () => { tree = create(<><First /><Second /></>); });
    await act(async () => { await debug.ready(); debug.track('single'); });
    expect(debug.getReport().logs.track).toHaveLength(1);
    expect(JSON.stringify(tree!.toJSON())).toContain('first-app');
    expect(JSON.stringify(tree!.toJSON())).toContain('second-app');
    expect(diagnostics.mock.calls.some(call => String(call[0]).includes('duplicate_host'))).toBe(true);
});
