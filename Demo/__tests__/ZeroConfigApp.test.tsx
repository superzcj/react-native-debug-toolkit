import React from 'react';
import { NativeModules } from 'react-native';
import { act, create } from 'react-test-renderer';
import { debug, withDebugToolkit } from 'react-native-debug-toolkit';
import ZeroConfigApp from '../ZeroConfigApp';

jest.mock('react-native-debug-toolkit', () => {
  const actual = jest.requireActual('react-native-debug-toolkit');
  return { ...actual, withDebugToolkit: jest.fn(actual.withDebugToolkit) };
});
jest.mock('react-native-mmkv', () => ({ createMMKV: () => ({
  getString: () => undefined, set: () => undefined, remove: () => true,
}) }), { virtual: true });

test('the zero configuration consumer passes only its root component to the HOC', () => {
  const calls = jest.mocked(withDebugToolkit).mock.calls;
  expect(calls).toHaveLength(1);
  expect(calls[0]).toHaveLength(1);
  expect(typeof calls[0]![0]).toBe('function');
});

test('business buttons generate unique console markers and send the same marker over HTTP', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const previousFetch = global.fetch;
  global.fetch = jest.fn(async () => new Response('{}', { status: 200 }));
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  let tree!: ReturnType<typeof create>;
  try {
    await act(async () => { tree = create(<ZeroConfigApp />); });
    await act(async () => { await debug.ready(); });
    await act(async () => { tree.root.findByProps({ title: '生成标记日志' }).props.onPress(); });
    await act(async () => { await tree.root.findByProps({ title: '发送测试请求' }).props.onPress(); });
    const markers = log.mock.calls.map(([value]) => value).filter(value => /^integration-1000-\d+$/.test(String(value)));
    expect(markers).toHaveLength(2);
    expect(new Set(markers).size).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(`http://localhost:3801/health?integration=${markers[1]}`);
    expect(JSON.stringify(tree.toJSON())).toContain(`200 · ${markers[1]}`);
    expect(debug.getReport().features.environment?.phase).toBe('empty');
    expect(debug.getReport().features.accounts?.phase).toBe('empty');
    expect(debug.getReport().features.tabs?.phase).toBe('empty');
  } finally {
    await act(async () => { tree?.unmount(); });
    now.mockRestore(); log.mockRestore(); errors.mockRestore(); global.fetch = previousFetch;
  }
});
