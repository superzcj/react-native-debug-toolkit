/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const originalConsoleError = console.error;
let consoleErrorSpy: jest.SpyInstance;
let consoleInfoSpy: jest.SpyInstance;

type FakeXhrEvent = 'load' | 'loadend' | 'error';

class DemoFakeXMLHttpRequest {
  static requests: DemoFakeXMLHttpRequest[] = [];

  method = '';
  url = '';
  body: unknown;
  readyState = 0;
  status = 200;
  statusText = 'OK';
  responseText = JSON.stringify({ id: 1, title: 'XHR smoke response' });
  response = this.responseText;
  onload: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  private listeners: Partial<Record<FakeXhrEvent, Array<() => void>>> = {};

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader() {}

  getAllResponseHeaders() {
    return 'content-type: application/json';
  }

  addEventListener(event: FakeXhrEvent, listener: () => void) {
    this.listeners[event] = [...(this.listeners[event] ?? []), listener];
  }

  send(body?: unknown) {
    this.body = body;
    this.readyState = 4;
    DemoFakeXMLHttpRequest.requests.push(this);
    this.onload?.();
    this.onreadystatechange?.();
    this.listeners.load?.forEach((listener) => listener());
    this.onloadend?.();
    this.listeners.loadend?.forEach((listener) => listener());
  }
}

function findText(
  root: ReactTestRenderer.ReactTestInstance,
  value: string,
): ReactTestRenderer.ReactTestInstance {
  return root.findAll(
    (node) => (node.type as unknown) === 'Text' && node.props.children === value,
  )[0];
}

function pressText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  let node: ReactTestRenderer.ReactTestInstance | null = findText(root, value);

  while (node && typeof node.props.onPress !== 'function') {
    node = node.parent;
  }

  if (!node) {
    throw new Error(`No pressable parent found for text "${value}"`);
  }

  node.props.onPress();
}

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('react-test-renderer is deprecated')
    ) {
      return;
    }
    originalConsoleError(...args);
  });
  consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
  consoleInfoSpy.mockRestore();
});

test('renders correctly', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => [
      {
        id: 1,
        title: 'mock post',
        body: 'mock body',
      },
      {
        id: 2,
        title: 'mock post 2',
        body: 'mock body 2',
      },
    ],
  }) as unknown as typeof fetch;

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('provides a raw XMLHttpRequest smoke action for network capture', async () => {
  const originalXMLHttpRequest = global.XMLHttpRequest;
  DemoFakeXMLHttpRequest.requests = [];
  global.XMLHttpRequest = DemoFakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => [
      {
        id: 1,
        title: 'mock post',
        body: 'mock body',
      },
      {
        id: 2,
        title: 'mock post 2',
        body: 'mock body 2',
      },
    ],
  }) as unknown as typeof fetch;

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Profile');
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'XHR GET');
    await Promise.resolve();
  });

  expect(DemoFakeXMLHttpRequest.requests).toEqual([
    expect.objectContaining({
      method: 'GET',
      url: 'https://jsonplaceholder.typicode.com/todos/1',
      body: undefined,
    }),
  ]);

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });

  if (originalXMLHttpRequest) {
    global.XMLHttpRequest = originalXMLHttpRequest;
  } else {
    delete (global as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  }
});
