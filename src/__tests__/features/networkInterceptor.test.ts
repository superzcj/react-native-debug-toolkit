import {
  resetInterceptors,
  startXMLHttpRequest,
} from '../../features/network/networkInterceptor';
import { _resetNetworkForTesting, createNetworkFeature } from '../../features/network';

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

  it('uses XMLHttpRequest as the default network capture path', async () => {
    const feature = createNetworkFeature();
    globalThis.fetch = jest.fn();

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
    expect(globalThis.fetch).not.toHaveBeenCalled();

    feature.cleanup();
  });
});

describe('NetworkFeature setup and cleanup', () => {
  afterEach(() => {
    _resetNetworkForTesting();
  });

  it('captures requests via XHR without axiosInstance', () => {
    const feature = createNetworkFeature();
    feature.setup();

    expect(feature.getSnapshot()).toHaveLength(0);

    feature.cleanup();
  });
});
