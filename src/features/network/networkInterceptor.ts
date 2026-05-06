import type { NetworkLogEntry } from '../../types';
import { urlRewriter } from '../../utils/urlRewriterRegistry';

type NetworkLogPayload = Omit<NetworkLogEntry, 'id'>;

// Intercepts React Native's XMLHttpRequest transport layer.
// RN fetch and axios (default adapter) both go through XHR — one hook captures everything.

// ─── Shared helpers ────────────────────────────────────

function rewriteUrl(url: string): string {
  const rewriter = urlRewriter.get();
  if (!rewriter) {
    return url;
  }
  try {
    return rewriter(url);
  } catch {
    return url;
  }
}

function parseRawHeaders(rawHeaders: string | null | undefined): Record<string, string> | undefined {
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
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function parseBodyText(raw: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function normalizeXhrResponseBody(xhr: XMLHttpRequestLike): unknown {
  const text = safeRead(() => xhr.responseText);
  if (typeof text === 'string' && text) {
    return parseBodyText(text);
  }

  const response = safeRead(() => xhr.response);
  if (response != null) {
    return response;
  }

  return undefined;
}

// ─── XMLHttpRequest interceptor ───────────────────────

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

type XhrState = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  timestamp: number;
  error?: string;
  completed?: boolean;
};

let originalXMLHttpRequest: XMLHttpRequestConstructorLike | null = null;
let originalXhrOpen: XMLHttpRequestLike['open'] | null = null;
let originalXhrSend: XMLHttpRequestLike['send'] | null = null;
let originalXhrSetRequestHeader: XMLHttpRequestLike['setRequestHeader'] | null = null;
let xhrRefCount = 0;
const pendingXhrRequests = new WeakMap<XMLHttpRequestLike, XhrState>();

function safeRead<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

function getGlobalXMLHttpRequest(): XMLHttpRequestConstructorLike | undefined {
  return (globalThis as { XMLHttpRequest?: XMLHttpRequestConstructorLike }).XMLHttpRequest;
}

function getXhrResponseHeaders(xhr: XMLHttpRequestLike): Record<string, string> | undefined {
  const rawHeaders = safeRead(() => xhr.getAllResponseHeaders?.());
  const parsedHeaders = parseRawHeaders(rawHeaders);
  if (parsedHeaders) {
    return parsedHeaders;
  }

  const headers = xhr.responseHeaders;
  if (!headers) {
    return undefined;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function stopXMLHttpRequest(): void {
  xhrRefCount = Math.max(0, xhrRefCount - 1);
  if (xhrRefCount > 0 || !originalXMLHttpRequest) {
    return;
  }

  const CurrentXMLHttpRequest = getGlobalXMLHttpRequest();
  if (CurrentXMLHttpRequest) {
    if (originalXhrOpen) {
      CurrentXMLHttpRequest.prototype.open = originalXhrOpen;
    }
    if (originalXhrSend) {
      CurrentXMLHttpRequest.prototype.send = originalXhrSend;
    }
    if (originalXhrSetRequestHeader) {
      CurrentXMLHttpRequest.prototype.setRequestHeader = originalXhrSetRequestHeader;
    }
  }

  originalXMLHttpRequest = null;
  originalXhrOpen = null;
  originalXhrSend = null;
  originalXhrSetRequestHeader = null;
}

export function startXMLHttpRequest(
  emit: (entry: NetworkLogPayload) => void,
): () => void {
  const CurrentXMLHttpRequest = getGlobalXMLHttpRequest();
  if (!CurrentXMLHttpRequest) {
    return () => {};
  }

  xhrRefCount += 1;
  if (originalXMLHttpRequest) {
    return () => {
      stopXMLHttpRequest();
    };
  }

  originalXMLHttpRequest = CurrentXMLHttpRequest;
  originalXhrOpen = CurrentXMLHttpRequest.prototype.open;
  originalXhrSend = CurrentXMLHttpRequest.prototype.send;
  originalXhrSetRequestHeader = CurrentXMLHttpRequest.prototype.setRequestHeader;

  CurrentXMLHttpRequest.prototype.open = function interceptedOpen(
    this: XMLHttpRequestLike,
    method: string,
    url: string,
    ...args: unknown[]
  ) {
    const rewrittenUrl = urlRewriter.get() ? rewriteUrl(url) : url;
    pendingXhrRequests.set(this, {
      method: (method || 'GET').toUpperCase(),
      url: rewrittenUrl,
      headers: {},
      timestamp: Date.now(),
    });
    return originalXhrOpen!.call(this, method, rewrittenUrl, ...args);
  };

  CurrentXMLHttpRequest.prototype.setRequestHeader = function interceptedSetRequestHeader(
    this: XMLHttpRequestLike,
    header: string,
    value: string,
  ) {
    const state = pendingXhrRequests.get(this);
    if (state) {
      state.headers[header] = value;
    }
    return originalXhrSetRequestHeader!.call(this, header, value);
  };

  CurrentXMLHttpRequest.prototype.send = function interceptedSend(
    this: XMLHttpRequestLike,
    body?: unknown,
  ) {
    const that = this;
    const state = pendingXhrRequests.get(that) ?? {
      method: 'GET',
      url: '',
      headers: {},
      timestamp: Date.now(),
    };
    state.body = body;
    state.timestamp = Date.now();
    pendingXhrRequests.set(that, state);

    const complete = () => {
      const currentState = pendingXhrRequests.get(that);
      if (!currentState || currentState.completed) {
        return;
      }
      currentState.completed = true;

      const headers = getXhrResponseHeaders(that);
      emit({
        timestamp: currentState.timestamp,
        duration: Date.now() - currentState.timestamp,
        request: {
          url: currentState.url,
          method: currentState.method,
          headers: Object.keys(currentState.headers).length > 0
            ? currentState.headers
            : undefined,
          body: currentState.body,
        },
        response: {
          status: that.status,
          statusText: that.statusText,
          headers,
          data: normalizeXhrResponseBody(that),
          success: that.status >= 200 && that.status < 300,
        },
        error: currentState.error,
      });
    };

    const markError = (message: string) => {
      const currentState = pendingXhrRequests.get(that);
      if (currentState) {
        currentState.error = message;
      }
    };

    that.addEventListener('error', () => {
      markError('Network Error');
    });
    that.addEventListener('timeout', () => {
      markError('Timeout');
    });
    that.addEventListener('abort', () => {
      markError('Aborted');
    });
    that.addEventListener('loadend', complete);

    return originalXhrSend!.call(that, body);
  };

  return () => {
    stopXMLHttpRequest();
  };
}

// ─── Cleanup ───────────────────────────────────────────

export function resetInterceptors(): void {
  if (originalXMLHttpRequest) {
    xhrRefCount = 1;
    stopXMLHttpRequest();
  }
  xhrRefCount = 0;
}
