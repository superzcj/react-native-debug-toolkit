/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const mockDaemonSettings = new Map<string, string>();
const mockAsyncStorage = {
  getItem: jest.fn(async (key: string) => mockDaemonSettings.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockDaemonSettings.set(key, value);
  }),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
}), { virtual: true });

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

function typeIntoPlaceholder(
  root: ReactTestRenderer.ReactTestInstance,
  placeholder: string,
  value: string,
) {
  const input = root.findByProps({ placeholder });
  input.props.onChangeText(value);
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

beforeEach(() => {
  mockDaemonSettings.clear();
  mockAsyncStorage.getItem.mockClear();
  mockAsyncStorage.setItem.mockClear();
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

test('shows desktop logs settings with simulator and real device choices', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => [],
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
    pressText(renderer!.root, 'Open Panel');
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(renderer!.root.findAll((node) => (
    (node.type as unknown) === 'Text' && node.props.children === 'Send Logs'
  ))).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, '⚙');
    await Promise.resolve();
  });

  expect(findText(renderer!.root, 'Desktop Logs')).toBeTruthy();
  expect(findText(renderer!.root, 'Simulator')).toBeTruthy();
  expect(findText(renderer!.root, 'Real device')).toBeTruthy();
  expect(findText(renderer!.root, 'Start Live Sync')).toBeTruthy();
  expect(findText(renderer!.root, 'Send Once')).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Real device');
    await Promise.resolve();
  });

  expect(findText(renderer!.root, 'Detect')).toBeTruthy();
  expect(renderer!.root.findByProps({ placeholder: '192.168.1.10' }).props).toMatchObject({
    keyboardType: 'numbers-and-punctuation',
    returnKeyType: 'done',
  });
  expect(renderer!.root.findAll((node) => (
    (node.type as unknown) === 'Text' && node.props.children === 'Done'
  ))).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('sends once from desktop logs settings to a real device endpoint', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'http://192.168.1.10:3799/health') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, name: 'react-native-debug-toolkit-daemon' }),
      };
    }
    if (url === 'http://192.168.1.10:3799/report') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          sessionId: 'desktop-settings-session',
          logCount: { navigation: 1 },
        }),
      };
    }
    return { json: async () => [] };
  }) as unknown as jest.MockedFunction<typeof fetch>;
  global.fetch = fetchMock;

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
    pressText(renderer!.root, 'Open Panel');
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, '⚙');
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Real device');
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    typeIntoPlaceholder(renderer!.root, '192.168.1.10', '192.168.1.10');
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Send Once');
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(fetchMock.mock.calls.some(([url]) => String(url) === 'http://192.168.1.10:3799/report')).toBe(true);
  expect(mockDaemonSettings.get('debugToolkit_connectionMode')).toBe('device');
  expect(mockDaemonSettings.get('debugToolkit_deviceHost')).toBe('192.168.1.10');

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});

test('does not send logs when the real device endpoint health check fails', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'http://192.168.1.10:3799/health') {
      return {
        ok: false,
        status: 404,
        json: async () => ({ ok: false }),
      };
    }
    return { json: async () => [] };
  }) as unknown as jest.MockedFunction<typeof fetch>;
  global.fetch = fetchMock;

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
    pressText(renderer!.root, 'Open Panel');
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, '⚙');
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Real device');
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    typeIntoPlaceholder(renderer!.root, '192.168.1.10', '192.168.1.10');
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    pressText(renderer!.root, 'Send Once');
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
    expect.arrayContaining(['http://192.168.1.10:3799/health']),
  );
  expect(fetchMock.mock.calls.some(([url]) => String(url) === 'http://192.168.1.10:3799/report')).toBe(false);
  expect(findText(renderer!.root, 'Cannot reach desktop. Try /health in phone browser.')).toBeTruthy();

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
