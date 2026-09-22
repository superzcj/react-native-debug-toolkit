import { acquireCollector, acquireRewriter } from '../../utils/xhrService';

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

describe('XHR owner leases', () => {
  const originalXhr = globalThis.XMLHttpRequest;
  const originalOpen = FakeXMLHttpRequest.prototype.open;
  const originalSend = FakeXMLHttpRequest.prototype.send;
  const releases: Array<() => void> = [];
  beforeEach(() => {
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    FakeXMLHttpRequest.handler = undefined;
  });
  afterEach(() => {
    releases.splice(0).forEach((release) => release());
    globalThis.XMLHttpRequest = originalXhr;
    jest.restoreAllMocks();
  });
  function request() {
    const xhr = new FakeXMLHttpRequest();
    xhr.open('GET', 'https://prod.test/items');
    xhr.send();
    return xhr;
  }
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('collector=%s rewriter=%s work independently', (collect, rewrite) => {
    const emit = jest.fn();
    if (collect) {
      releases.push(acquireCollector(Symbol(), emit));
    }
    if (rewrite) {
      releases.push(acquireRewriter(Symbol(), (url) => url.replace('prod', 'dev')));
    }
    const now = jest.spyOn(Date, 'now');
    const xhr = request();
    const readResponse = jest.spyOn(xhr, 'getAllResponseHeaders');
    xhr.respond({ status: 200, body: 'ok' });
    expect(xhr.url).toBe(rewrite ? 'https://dev.test/items' : 'https://prod.test/items');
    expect(emit).toHaveBeenCalledTimes(collect ? 1 : 0);
    if (!collect) {
      expect(now).not.toHaveBeenCalled();
      expect(readResponse).not.toHaveBeenCalled();
    } else {
      expect(emit.mock.calls[0][0]).toMatchObject({
        url: xhr.url,
        method: 'GET',
        status: 200,
        responseBody: 'ok',
      });
    }
  });
  it('keeps a new rewriter when an old release runs again', () => {
    const owner = Symbol();
    const releaseOld = acquireRewriter(owner, (url) => url);
    releaseOld();
    releases.push(acquireRewriter(Symbol('new'), (url) => url.replace('prod', 'new')));
    releaseOld();
    expect(request().url).toBe('https://new.test/items');
  });
  it('replaces a registration by identity and rejects conflicting rewrite owners', () => {
    const owner = Symbol();
    const releaseOld = acquireRewriter(owner, (url) => url);
    releases.push(releaseOld);
    releases.push(acquireRewriter(owner, (url) => url.replace('prod', 'new')));
    releaseOld();
    expect(() => acquireRewriter(Symbol(), (url) => url)).toThrow();
    expect(request().url).toBe('https://new.test/items');
  });
  it('only notifies active collectors and isolates a throwing collector', () => {
    const removed = jest.fn();
    const emit = jest.fn();
    const stop = acquireCollector(Symbol(), removed);
    releases.push(
      stop,
      acquireCollector(Symbol(), () => {
        throw new Error('consumer');
      }),
      acquireCollector(Symbol(), emit),
    );
    const xhr = request();
    stop();
    expect(() => xhr.respond({ status: 201, body: 'done' })).not.toThrow();
    expect(removed).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(emit.mock.calls[0][0])).toBe(true);
  });
  it('copies response headers into an immutable completion snapshot', () => {
    const emit = jest.fn();
    releases.push(acquireCollector(Symbol(), emit));
    const xhr = request();
    xhr.respond({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'ok',
    });
    const record = emit.mock.calls[0][0];
    expect(Object.isFrozen(record.responseHeaders)).toBe(true);
    xhr.responseHeaders['content-type'] = 'application/json';
    expect(record.responseHeaders).toEqual({ 'content-type': 'text/plain' });
  });
  it('does not notify replacement collectors about requests from a previous registration', () => {
    const owner = Symbol();
    const oldEmit = jest.fn();
    const newEmit = jest.fn();
    const stop = acquireCollector(owner, oldEmit);
    releases.push(stop);
    const xhr = request();
    releases.push(acquireCollector(owner, newEmit));
    stop();
    xhr.respond({ status: 200, body: 'old' });
    expect(oldEmit).not.toHaveBeenCalled();
    expect(newEmit).not.toHaveBeenCalled();
    request().respond({ status: 200, body: 'new' });
    expect(newEmit).toHaveBeenCalledTimes(1);
  });
  it('keeps collecting when rewriting stops and supports repeated mount cycles', () => {
    for (let cycle = 0; cycle < 3; cycle++) {
      const emit = jest.fn();
      const stopCollect = acquireCollector(Symbol(), emit);
      const stopRewrite = acquireRewriter(Symbol(), (url) => url.replace('prod', 'dev'));
      releases.push(stopCollect, stopRewrite);
      stopRewrite();
      const xhr = request();
      xhr.respond({ status: 200, body: 'ok' });
      expect(xhr.url).toBe('https://prod.test/items');
      expect(emit).toHaveBeenCalledTimes(1);
      stopCollect();
      expect(FakeXMLHttpRequest.prototype.open).toBe(originalOpen);
      expect(FakeXMLHttpRequest.prototype.send).toBe(originalSend);
    }
  });
  it('releases during a request and restores hooks after the last lease', () => {
    const emit = jest.fn();
    const stopCollect = acquireCollector(Symbol(), emit);
    const stopRewrite = acquireRewriter(Symbol(), (url) => url.replace('prod', 'dev'));
    releases.push(stopCollect, stopRewrite);
    const xhr = request();
    stopCollect();
    expect(request().url).toBe('https://dev.test/items');
    stopRewrite();
    expect(FakeXMLHttpRequest.prototype.open).toBe(originalOpen);
    expect(FakeXMLHttpRequest.prototype.send).toBe(originalSend);
    xhr.respond({ status: 200, body: 'late' });
    expect(emit).not.toHaveBeenCalled();
    releases.push(acquireCollector(Symbol(), emit));
    request().respond({ status: 200, body: 'next' });
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
