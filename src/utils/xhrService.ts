export interface XhrRecord {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly requestBody?: unknown;
  readonly responseBody?: unknown;
  readonly requestHeaders?: Record<string, string>;
  readonly responseHeaders?: Record<string, string>;
  readonly statusText?: string;
  readonly error?: string;
}

interface XMLHttpRequestLike {
  readyState: number;
  DONE?: number;
  status: number;
  statusText?: string;
  responseHeaders?: Record<string, string> | null;
  responseType?: string;
  response?: unknown;
  responseText?: string;
  responseURL?: string;
  open(method: string, url: string, ...args: unknown[]): void;
  send(body?: unknown): void;
  setRequestHeader(header: string, value: string): void;
  getAllResponseHeaders?(): string | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

type XMLHttpRequestConstructorLike = new () => XMLHttpRequestLike;

function parseRawHeaders(
  rawHeaders: string | null | undefined,
): Record<string, string> | undefined {
  if (!rawHeaders) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  rawHeaders
    .trim()
    .split(/[\r\n]+/)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) {
        headers[key] = value;
      }
    });
  return Object.keys(headers).length > 0 ? Object.freeze({ ...headers }) : undefined;
}

function getXhrResponseHeaders(xhr: XMLHttpRequestLike): Record<string, string> | undefined {
  const rawHeaders = safeRead(() => xhr.getAllResponseHeaders?.());
  const parsedHeaders = parseRawHeaders(rawHeaders);
  if (parsedHeaders) {
    return Object.freeze({ ...parsedHeaders });
  }

  const headers = xhr.responseHeaders;
  if (!headers) {
    return undefined;
  }
  return Object.keys(headers).length > 0 ? Object.freeze({ ...headers }) : undefined;
}

function safeRead<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

type Collector = { owner: symbol; emit: (record: XhrRecord) => void };
type Rewriter = { rewrite: (url: string) => string };
export interface XhrRequestMetadata {
  readonly url: string;
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

export interface XhrInvocationCapture {
  shouldSuppress: () => boolean;
}

export interface XhrInvocationContext {
  onRequest: (request: XhrRequestMetadata) => XhrInvocationCapture | undefined;
}

const collectors = new Map<symbol, Collector>();
const rewriters = new Map<symbol, Rewriter>();
let uninstall: (() => void) | undefined;
let activeInvocationContext: XhrInvocationContext | undefined;

export function withXhrInvocationContext<T>(context: XhrInvocationContext, invoke: () => T): T {
  const previous = activeInvocationContext;
  activeInvocationContext = context;
  try {
    return invoke();
  } finally {
    activeInvocationContext = previous;
  }
}

function install(): void {
  if (uninstall) {
    return;
  }
  const Xhr = (globalThis as { XMLHttpRequest?: XMLHttpRequestConstructorLike }).XMLHttpRequest;
  if (!Xhr) {
    return;
  }
  const prototype: XMLHttpRequestLike = Xhr.prototype;
  const originalOpen = prototype.open;
  const originalSend = prototype.send;
  const originalSetHeader = prototype.setRequestHeader;
  type RequestState = {
    url: string;
    method: string;
    headers: Record<string, string>;
    collectors: Collector[];
    invocationContext?: XhrInvocationContext;
    invocationCapture?: XhrInvocationCapture;
    dispose?: () => void;
  };
  const requests = new WeakMap<XMLHttpRequestLike, RequestState>();

  prototype.open = function (method, url, ...args) {
    requests.get(this)?.dispose?.();
    requests.delete(this);
    const rewriter = rewriters.values().next().value;
    const rewritten = rewriter ? safeRead(() => rewriter.rewrite(url)) ?? url : url;
    if (collectors.size) {
      requests.set(this, {
        url: rewritten,
        method: (method || 'GET').toUpperCase(),
        headers: {},
        collectors: [...collectors.values()],
        invocationContext: activeInvocationContext,
      });
    }
    return originalOpen.call(this, method, rewritten, ...args);
  };
  prototype.setRequestHeader = function (header, value) {
    const state = requests.get(this);
    if (state) {
      state.headers[header] = value;
    }
    return originalSetHeader.call(this, header, value);
  };
  prototype.send = function (body) {
    const state = requests.get(this);
    if (!state || !state.collectors.some((item) => collectors.get(item.owner) === item)) {
      return originalSend.call(this, body);
    }
    state.invocationCapture = safeRead(() => state.invocationContext?.onRequest({
      url: state.url,
      method: state.method,
      headers: Object.keys(state.headers).length
        ? Object.freeze({ ...state.headers })
        : undefined,
      body,
    }));
    const startedAt = Date.now();
    let completed = false;
    let error: string | undefined;
    const onError = () => {
      error = 'Network Error';
    };
    const onTimeout = () => {
      error = 'Timeout';
    };
    const onAbort = () => {
      error = 'Aborted';
    };
    const dispose = () => {
      this.removeEventListener('error', onError);
      this.removeEventListener('timeout', onTimeout);
      this.removeEventListener('abort', onAbort);
      this.removeEventListener('loadend', complete);
    };
    const complete = () => {
      if (completed) {
        return;
      }
      completed = true;
      dispose();
      requests.delete(this);
      const active = state.collectors.filter((item) => collectors.get(item.owner) === item);
      if (!active.length || safeRead(() => state.invocationCapture?.shouldSuppress()) === true) {
        return;
      }
      const text = safeRead(() => this.responseText);
      const record: XhrRecord = Object.freeze({
        url: state.url,
        method: state.method,
        status: this.status,
        startedAt,
        durationMs: Date.now() - startedAt,
        requestBody: body,
        responseBody: typeof text === 'string' && text ? text : safeRead(() => this.response),
        requestHeaders: Object.keys(state.headers).length
          ? Object.freeze({ ...state.headers })
          : undefined,
        responseHeaders: getXhrResponseHeaders(this),
        statusText: this.statusText,
        error,
      });
      for (const item of active) {
        if (collectors.get(item.owner) !== item) {
          continue;
        }
        try {
          item.emit(Object.freeze({ ...record }));
        } catch {
          /* Never interrupt transport. */
        }
      }
    };
    state.dispose = dispose;
    this.addEventListener('error', onError);
    this.addEventListener('timeout', onTimeout);
    this.addEventListener('abort', onAbort);
    this.addEventListener('loadend', complete);
    try {
      return originalSend.call(this, body);
    } catch (cause) {
      dispose();
      requests.delete(this);
      throw cause;
    }
  };
  uninstall = () => {
    prototype.open = originalOpen;
    prototype.send = originalSend;
    prototype.setRequestHeader = originalSetHeader;
  };
}

function releaseIfUnused(): void {
  if (collectors.size || rewriters.size) {
    return;
  }
  uninstall?.();
  uninstall = undefined;
}

export function acquireCollector(owner: symbol, emit: (record: XhrRecord) => void): () => void {
  const registration = { owner, emit };
  collectors.set(owner, registration);
  install();
  return () => {
    if (collectors.get(owner) === registration) {
      collectors.delete(owner);
    }
    releaseIfUnused();
  };
}

export function acquireRewriter(owner: symbol, rewrite: (url: string) => string): () => void {
  if (rewriters.size && !rewriters.has(owner)) {
    throw new Error('An XHR URL rewriter is already registered by another owner');
  }
  const registration = { rewrite };
  rewriters.set(owner, registration);
  install();
  return () => {
    if (rewriters.get(owner) === registration) {
      rewriters.delete(owner);
    }
    releaseIfUnused();
  };
}
