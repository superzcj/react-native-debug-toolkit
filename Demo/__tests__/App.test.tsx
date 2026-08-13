/** @format */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { DebugToolkit } from '../../src/core/DebugToolkit';
import { _resetHubClientForTesting } from '../../src/utils/HubClient';

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}), { virtual: true });

function findText(
  root: ReactTestRenderer.ReactTestInstance,
  value: string,
): ReactTestRenderer.ReactTestInstance {
  const text = root.findAll(
    (node) => (node.type as unknown) === 'Text' && node.props.children === value,
  )[0];
  if (!text) throw new Error(`Text not found: ${value}`);
  return text;
}

function pressText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  let node: ReactTestRenderer.ReactTestInstance | null = findText(root, value);
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`No pressable parent for ${value}`);
  node.props.onPress();
}

function pressTextStartingWith(root: ReactTestRenderer.ReactTestInstance, prefix: string) {
  const text = root.findAll(
    (node) => (node.type as unknown) === 'Text'
      && typeof node.props.children === 'string'
      && node.props.children.startsWith(prefix),
  )[0];
  if (!text) throw new Error(`No Text starts with ${prefix}`);
  let node: ReactTestRenderer.ReactTestInstance | null = text;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`No pressable parent for ${prefix}`);
  node.props.onPress();
}

async function flushHub(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function readyResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      name: 'react-native-debug-toolkit-hub',
      protocolVersion: 1,
    }),
  };
}

function openSessionResponse() {
  return {
    ok: true,
    status: 201,
    json: async () => ({
      ok: true,
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      deviceId: 'demo-device',
      expectedSequence: 1,
      ackThrough: 0,
    }),
  };
}

function mockHubFetch(): jest.MockedFunction<typeof fetch> {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/ready') && (!init?.method || init.method === 'GET')) {
      return readyResponse();
    }
    if (url.includes('/sessions') && init?.method === 'POST' && !url.includes('/events')) {
      return openSessionResponse();
    }
    if (url.includes('/events') && init?.method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ackThrough: 1, expectedSequence: 2, rejected: [] }),
      };
    }
    if (url.includes('/heartbeat') && init?.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

async function openConnectTab(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    pressText(renderer.root, 'Profile');
    await Promise.resolve();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    pressText(renderer.root, 'Open Panel');
    await Promise.resolve();
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    pressText(renderer.root, 'Connect');
    await flushHub();
  });
}

let consoleErrorSpy: jest.SpyInstance;
let consoleInfoSpy: jest.SpyInstance;
let consoleWarnSpy: jest.SpyInstance;

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
  consoleInfoSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

beforeEach(() => {
  DebugToolkit.destroy();
  _resetHubClientForTesting();
});

afterEach(() => {
  _resetHubClientForTesting();
  DebugToolkit.destroy();
});

test('opens the v4 local Hub controls', async () => {
  global.fetch = mockHubFetch();

  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await flushHub();
  });
  await openConnectTab(renderer!);

  expect(findText(renderer!.root, 'Hub Address')).toBeTruthy();
  expect(findText(renderer!.root, 'Upload Once')).toBeTruthy();
  expect(findText(renderer!.root, 'Stop Live Logs')).toBeTruthy();
  expect(renderer!.root.findByProps({ placeholder: 'http://127.0.0.1:3800' }).props.value)
    .toBe('http://127.0.0.1:3800');

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Stop Live Logs');
    await Promise.resolve();
  });
  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Start Live Logs');
    await Promise.resolve();
  });
  expect(findText(renderer!.root, 'Stop Live Logs')).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('uploads a snapshot batch to the local Hub', async () => {
  const fetchMock = mockHubFetch();
  global.fetch = fetchMock;

  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await flushHub();
  });
  await openConnectTab(renderer!);
  await ReactTestRenderer.act(async () => {
    pressTextStartingWith(renderer!.root, 'Upload Once');
    await flushHub();
  });

  const eventsCall = fetchMock.mock.calls.find(([url, init]) =>
    String(url).includes('/events') && init?.method === 'POST',
  );
  expect(eventsCall).toBeDefined();
  const body = JSON.parse(eventsCall![1]!.body as string);
  expect(body.events.length).toBeGreaterThan(0);
  expect(body.generation).toBeUndefined();
  expect(body.events[0].payloadHash).toBeUndefined();

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('automatically flushes navigation logs without pressing Upload Once', async () => {
  jest.useFakeTimers();
  const fetchMock = mockHubFetch();
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/ready') && (!init?.method || init.method === 'GET')) {
      return readyResponse();
    }
    if (url.includes('/sessions') && init?.method === 'POST' && !url.includes('/events')) {
      return openSessionResponse();
    }
    if (url.includes('/events') && init?.method === 'POST') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ackThrough: 50, expectedSequence: 51, rejected: [] }),
      };
    }
    if (url.includes('/heartbeat') && init?.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  global.fetch = fetchMock;

  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await flushHub();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Profile');
    await flushHub();
    await jest.advanceTimersByTimeAsync(1000);
  });

  const eventsCall = fetchMock.mock.calls.find(([url, init]) =>
    String(url).includes('/events') && init?.method === 'POST',
  );
  expect(eventsCall).toBeDefined();
  const body = JSON.parse(eventsCall![1]!.body as string);
  expect(body.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'navigation' }),
  ]));

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
  jest.useRealTimers();
});
