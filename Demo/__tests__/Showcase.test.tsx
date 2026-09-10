import React from 'react';
import Renderer from 'react-test-renderer';
import { Showcase } from '../Showcase';
import { checkoutRequest } from '../demoApi';
import { addTrackLog } from 'react-native-debug-toolkit';

jest.mock('../demoApi', () => ({ checkoutRequest: jest.fn(), DEMO_API: 'http://localhost:3801' }));
jest.mock('react-native-debug-toolkit', () => ({ addTrackLog: jest.fn(), DebugToolkit: { openPanel: jest.fn() } }));

function press(root: Renderer.ReactTestInstance, label: string) {
  let node = root.findAll((item) => (item.type as unknown) === 'Text' && item.props.children === label)[0];
  while (node && !node.props.onPress) node = node.parent!;
  return node.props.onPress();
}

test.each([
  [409, false, { message: 'Item unavailable' }, 'checkout_failed'],
  [201, true, { orderId: 'AT-1042' }, 'checkout_completed'],
])('reports the actual checkout result for HTTP %s', async (status, ok, data, eventName) => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const onAddItem = jest.fn();
  (checkoutRequest as jest.Mock).mockResolvedValue({ status, ok, data });
  let tree!: Renderer.ReactTestRenderer;
  try {
    await Renderer.act(async () => { tree = Renderer.create(<Showcase onAddItem={onAddItem} />); });
    await Renderer.act(async () => { await press(tree.root, ok ? 'Try successful request' : 'Run failed checkout'); });
    expect(onAddItem).toHaveBeenCalledTimes(1);
    expect(addTrackLog).toHaveBeenCalledWith(expect.objectContaining({ eventName, status }));
    expect(JSON.stringify(tree.toJSON())).toContain(String(status));
  } finally {
    await Renderer.act(async () => tree.unmount());
    jest.restoreAllMocks();
    jest.clearAllMocks();
  }
});

test('gives a retry instruction when the local API is unavailable', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (checkoutRequest as jest.Mock).mockRejectedValue(new Error('offline'));
  let tree!: Renderer.ReactTestRenderer;
  try {
    await Renderer.act(async () => { tree = Renderer.create(<Showcase onAddItem={() => {}} />); });
    await Renderer.act(async () => { await press(tree.root, 'Run failed checkout'); });
    expect(JSON.stringify(tree.toJSON())).toContain('API offline.');
    expect(addTrackLog).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: 'checkout_completed' }));
  } finally {
    await Renderer.act(async () => tree.unmount());
    jest.restoreAllMocks();
    jest.clearAllMocks();
  }
});
