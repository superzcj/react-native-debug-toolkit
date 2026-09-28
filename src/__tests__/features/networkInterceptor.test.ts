import { createLogRuntime } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import {
  resetInterceptors,
  startFetch,
  startXMLHttpRequest,
} from '../../features/network/networkInterceptor';
import { _resetNetworkForTesting, createNetworkFeature } from '../../features/network';

import { setUrlRewriter } from '../../utils/urlRewriter';

type FakeXhrHandler = (xhr: FakeXMLHttpRequest) => void;

class FakeXMLHttpRequest {
  static latest: FakeXMLHttpRequest | undefined;
  static handler: FakeXhrHandler | undefined;

  readonly UNSENT = 0;
  readonly OPENED = 1;
  readonly HEADERS_RECEIVED = 2;
  readonly LOADING = 3;
  readonly DONE = 4;

  readyState = this.UNSENT;
  status = 0;
  statusText = '';
  responseHeaders: Record<string, string> = {};
  responseType = '';
  response: unknown = '';
  responseText = '';
  responseURL = '';
  timeout = 0;

  onreadystatechange: (() => void) | null = null;
  onloadend: (() => void) | null = null;

  method = '';
  url = '';
  body: unknown;
  requestHeaders: Record<string, string> = {};

  private listeners: Record<string, Array<() => void>> = {};

  constructor() {
    FakeXMLHttpRequest.latest = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    this.readyState = this.OPENED;
  }

  setRequestHeader(header: string, value: string) {
    this.requestHeaders[header] = value;
  }

  send(body?: unknown) {
    this.body = body;
    FakeXMLHttpRequest.handler?.(this);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type]!.push(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== listener);
  }

  getAllResponseHeaders() {
    return Object.entries(this.responseHeaders)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
  }

  respond({
    status,
    statusText = 'OK',
    headers = {},
    body,
    responseType = '',
  }: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    body: unknown;
    responseType?: string;
  }) {
    this.status = status;
    this.statusText = statusText;
    this.responseHeaders = headers;
    this.responseType = responseType;
    this.responseURL = this.url;
    this.response = body;
    this.responseText = typeof body === 'string' ? body : '';
    this.readyState = this.DONE;
    this.onreadystatechange?.();
    this.listeners.loadend?.forEach((listener) => listener());
    this.onloadend?.();
  }
}

async function flushNetworkLog() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('networkInterceptor XMLHttpRequest setup', () => {
  let originalXMLHttpRequest: typeof globalThis.XMLHttpRequest | undefined;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalXMLHttpRequest = globalThis.XMLHttpRequest;
    originalFetch = globalThis.fetch;
    FakeXMLHttpRequest.latest = undefined;
    FakeXMLHttpRequest.handler = undefined;
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    resetInterceptors();
    setUrlRewriter(null);
    if (originalXMLHttpRequest) {
      globalThis.XMLHttpRequest = originalXMLHttpRequest;
    } else {
      delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    }
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
  });

  it('captures XMLHttpRequest request and JSON response data', async () => {
    const emit = jest.fn();
    startXMLHttpRequest(emit);

    FakeXMLHttpRequest.handler = (xhr) => {
      xhr.respond({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
      });
    };

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.example.com/items');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{"name":"demo"}');

    await flushNetworkLog();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      request: {
        url: 'https://api.example.com/items',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":"demo"}',
      },
      response: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { ok: true },
        success: true,
      },
    });
  });

  it('network cleanup leaves the environment rewriter active', () => {
    setUrlRewriter((url) => url.replace('prod', 'dev'));
    const feature = createNetworkFeature(undefined, testRuntime());
    feature.setup();
    feature.cleanup();
    const xhr = new FakeXMLHttpRequest();
    xhr.open('GET', 'https://prod.test/items');
    xhr.send();
    expect(xhr.url).toBe('https://dev.test/items');
  });

  it('excludes string and stateful RegExp URLs consistently on repeated requests', () => {
    const pattern = /health/g;
    pattern.lastIndex = 2;
    const feature = createNetworkFeature({
      excludeUrls: ['/private', pattern],
    }, testRuntime());
    feature.setup();
    FakeXMLHttpRequest.handler = (xhr) => xhr.respond({ status: 200, body: 'ok' });
    ['/health', '/health', '/private', '/public'].forEach((path) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `https://api.test${path}`);
      xhr.send();
    });
    expect(feature.getSnapshot().map((entry) => entry.request.url)).toEqual([
      'https://api.test/public',
    ]);
    expect(pattern.lastIndex).toBe(2);
    feature.cleanup();
  });

  it('delivers each request once to each mounted network feature', () => {
    const first = createNetworkFeature(undefined, testRuntime());
    const second = createNetworkFeature(undefined, testRuntime());
    first.setup();
    second.setup();
    FakeXMLHttpRequest.handler = (xhr) => xhr.respond({ status: 200, body: 'ok' });
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/items');
    xhr.send();
    expect(first.getSnapshot()).toHaveLength(1);
    expect(second.getSnapshot()).toHaveLength(1);
    first.cleanup();
    second.cleanup();
  });

  it('uses XMLHttpRequest as the default network capture path', async () => {
    const feature = createNetworkFeature(undefined, testRuntime());
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;

    feature.setup();

    FakeXMLHttpRequest.handler = (xhr) => {
      xhr.respond({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'ok',
      });
    };

    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.example.com/default');
    xhr.send();

    await flushNetworkLog();

    expect(feature.getSnapshot()).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();

    feature.cleanup();
  });
});

describe('networkInterceptor global fetch', () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    resetInterceptors();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  });

  it('captures fetch calls that never reach XMLHttpRequest', async () => {
    const emit = jest.fn();
    const original = jest.fn(async () =>
      new Response('{"ok":true}', {
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = original as unknown as typeof fetch;
    const stop = startFetch(emit);

    const response = await fetch('https://api.example.com/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"demo"}',
    });

    expect(await response.json()).toEqual({ ok: true });
    await flushNetworkLog();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      request: {
        url: 'https://api.example.com/items',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"name":"demo"}',
      },
      response: {
        status: 201,
        statusText: 'Created',
        data: { ok: true },
        success: true,
      },
    });
    stop();
    expect(globalThis.fetch).toBe(original);
  });

  it('records a failed fetch and rethrows', async () => {
    const emit = jest.fn();
    globalThis.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    startFetch(emit);

    await expect(fetch('https://api.example.com/down')).rejects.toThrow('offline');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({
      request: { url: 'https://api.example.com/down', method: 'GET' },
      error: 'offline',
    });
  });

  it('does not read event-stream bodies', async () => {
    const emit = jest.fn();
    globalThis.fetch = jest.fn(async () =>
      new Response('data: hi', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    ) as unknown as typeof fetch;
    startFetch(emit);

    await fetch('https://api.example.com/stream');
    await flushNetworkLog();

    expect(emit.mock.calls[0][0].response.data).toBeUndefined();
  });

  it('logs an XHR-backed fetch once', async () => {
    const previousXMLHttpRequest = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    const feature = createNetworkFeature(undefined, testRuntime());
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', String(input));
      xhr.send();
      return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    }) as typeof fetch;
    FakeXMLHttpRequest.handler = (xhr) => xhr.respond({ status: 200, body: 'ok' });
    feature.setup();

    const response = await fetch('https://api.example.com/via-xhr');
    expect(await response.text()).toBe('ok');
    await flushNetworkLog();

    expect(feature.getSnapshot()).toHaveLength(1);
    expect(feature.getSnapshot()[0]?.request.url).toBe('https://api.example.com/via-xhr');
    feature.cleanup();
    globalThis.XMLHttpRequest = previousXMLHttpRequest;
  });
});

describe('NetworkFeature setup and cleanup', () => {
  afterEach(() => {
    _resetNetworkForTesting();
  });

  it('captures requests via XHR without axiosInstance', () => {
    const feature = createNetworkFeature(undefined, testRuntime());
    feature.setup();

    expect(feature.getSnapshot()).toHaveLength(0);

    feature.cleanup();
  });
});

function testRuntime() { return createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: new MemoryStorageAdapter(), preferenceDisk: new MemoryStorageAdapter() }); }
