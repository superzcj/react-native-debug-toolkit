import React from 'react';
import Renderer from 'react-test-renderer';
import { NativeModules } from 'react-native';
import { debug } from 'react-native-debug-toolkit';
import App from '../App';
import { getDemoApi, demoSession } from '../demoApi';
import { demoDebugConfig, shopSource, INITIAL_STORE } from '../debug.config';

jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: () => undefined, set: () => undefined, remove: () => true,
}) }), { virtual: true });

// The HTTP boundary is replaced here; API status semantics are covered by test:api.
class CheckoutXHR {
  static requests: CheckoutXHR[] = [];
  static offline = false;
  url = '';
  body = '';
  status = 0;
  responseText = '';
  responseType = '';
  responseURL = '';
  readyState = 0;
  onload?: () => void;
  onerror?: () => void;
  private listeners = new Set<() => void>();
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader() {}
  addEventListener(event: string, listener: () => void) { if (event === 'loadend') this.listeners.add(listener); }
  removeEventListener(_event: string, listener: () => void) { this.listeners.delete(listener); }
  getAllResponseHeaders() { return 'Content-Type: application/json'; }
  send(body: string) {
    this.body = body;
    CheckoutXHR.requests.push(this);
    if (CheckoutXHR.offline) { this.onerror?.(); return; }
    const input = JSON.parse(body);
    this.status = input.scenario === 'sold-out' ? 409 : 201;
    this.responseText = JSON.stringify(this.status === 409
      ? { message: 'Item unavailable' } : { orderId: 'AT-1042', status: 'confirmed', ...input });
    this.responseURL = this.url;
    this.readyState = 4;
    this.onload?.();
    this.listeners.forEach(listener => listener());
  }
}

function press(root: Renderer.ReactTestInstance, label: string) {
  let node = root.findAll(item => (item.type as unknown) === 'Text' && item.props.children === label)[0];
  while (node && !node.props.onPress) node = node.parent!;
  if (!node) throw new Error(`Button not found: ${label}`);
  return node.props.onPress();
}

const originalFetch = global.fetch;
const originalXHR = global.XMLHttpRequest;
let tree: Renderer.ReactTestRenderer | undefined;

beforeEach(async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  global.XMLHttpRequest = CheckoutXHR as unknown as typeof XMLHttpRequest;
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/ready')) throw new Error('Hub offline');
    return new Response('[]', { status: 200 });
  });
  CheckoutXHR.requests = [];
  CheckoutXHR.offline = false;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  shopSource.publish(INITIAL_STORE);
  await Renderer.act(async () => { tree = Renderer.create(<App />); });
  await Renderer.act(async () => { await debug.ready(); });
});

afterEach(async () => {
  await Renderer.act(async () => { tree?.unmount(); });
  tree = undefined;
  global.fetch = originalFetch;
  global.XMLHttpRequest = originalXHR;
  jest.restoreAllMocks();
});

test('the actual environment callback changes the checkout client before the successful retry', async () => {
  await Renderer.act(async () => { await press(tree!.root, 'Run failed checkout'); });
  expect(CheckoutXHR.requests[0]?.url).toBe('http://localhost:3801/checkout');
  expect(JSON.stringify(tree!.toJSON())).toContain('409');
  expect(shopSource.getSnapshot().cartItems[0]?.quantity).toBe(1);
  await Renderer.act(async () => { debug.open(); });
  await Renderer.act(async () => { tree!.root.findByProps({ testID: 'debug-tab-environment' }).props.onPress(); });
  await Renderer.act(async () => { await press(tree!.root, 'Staging'); });
  expect(getDemoApi()).toBe('http://localhost:3802');
  await Renderer.act(async () => { debug.close(); await press(tree!.root, 'Try successful request'); });
  expect(CheckoutXHR.requests[1]?.url).toBe('http://localhost:3802/checkout');
  expect(JSON.stringify(tree!.toJSON())).toContain('201');
  expect(shopSource.getSnapshot().cartItems[0]?.quantity).toBe(2);
  expect(debug.getReport().logs.track).toEqual(expect.arrayContaining([
    expect.objectContaining({ eventName: 'checkout_failed' }),
    expect.objectContaining({ eventName: 'checkout_completed' }),
  ]));
  expect(debug.getReport().logs.state?.length).toBeGreaterThan(0);
  await Renderer.act(async () => { debug.open(); });
  await Renderer.act(async () => { tree!.root.findByProps({ testID: 'debug-tab-tabs' }).props.onPress(); });
  expect(JSON.stringify(tree!.toJSON())).toContain('¥1398');
});

test('the Staging quick action synchronizes the badge and can be switched back from the environment page', async () => {
  await Renderer.act(async () => {
    await demoDebugConfig.quickActions.items.find(item => item.id === 'use-staging')!.onPress();
  });
  expect(getDemoApi()).toBe('http://localhost:3802');
  expect(tree!.root.findByProps({ testID: 'debug-toolkit-launcher' }).findAllByProps({ children: 'STA' }).length).toBeGreaterThan(0);
  await Renderer.act(async () => { debug.open(); });
  await Renderer.act(async () => { tree!.root.findByProps({ testID: 'debug-tab-environment' }).props.onPress(); });
  await Renderer.act(async () => { await press(tree!.root, 'Development'); });
  expect(getDemoApi()).toBe('http://localhost:3801');
  expect(tree!.root.findByProps({ testID: 'debug-toolkit-launcher' }).findAllByProps({ children: 'DEV' }).length).toBeGreaterThan(0);
});

test('account feedback commits successfully and the checkout uses the selected business account', async () => {
  await Renderer.act(async () => { await press(tree!.root, 'Switch to studio account'); });
  expect(demoSession.getSnapshot().account.id).toBe('studio');
  expect(JSON.stringify(tree!.toJSON())).toContain('Account switch: success');
  expect(JSON.stringify(tree!.toJSON())).toContain('Atelier Studio');
  await Renderer.act(async () => { await press(tree!.root, 'Try successful request'); });
  expect(JSON.parse(CheckoutXHR.requests[0]!.body).accountId).toBe('studio');
});

test('copy displays actual channel results when the phone and Hub are unavailable', async () => {
  await Renderer.act(async () => { await press(tree!.root, 'Run failed checkout'); });
  await Renderer.act(async () => { await press(tree!.root, 'Copy checkout result'); });
  const output = JSON.stringify(tree!.toJSON());
  expect(output).toContain('Phone: unavailable');
  expect(output).toContain('Console: success');
  expect(output).toContain('Hub: unavailable');
});

test('an offline API gives retry guidance without recording checkout success', async () => {
  CheckoutXHR.offline = true;
  await Renderer.act(async () => { await press(tree!.root, 'Run failed checkout'); });
  expect(JSON.stringify(tree!.toJSON())).toContain('API offline.');
  expect(debug.getReport().logs.track).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ eventName: 'checkout_completed' }),
  ]));
});
