import type { NetworkLogEntry } from '../../types';
import { acquireCollector } from '../../utils/xhrService';

type NetworkLogPayload = Omit<NetworkLogEntry, 'id'>;
export type { NetworkLogPayload };

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') {
    return body;
  }
  if (!body) {
    return undefined;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const activeReleases = new Set<() => void>();
const BODY_LIMIT = 100_000;

// Expo replaces global fetch with a native client that never touches XMLHttpRequest.
// While that wrapper is in flight, skip the XHR collector so RN's XHR-backed fetch is logged once.
let fetchCaptureDepth = 0;

// Axios and the React Native fetch polyfill share the XHR collector.
export function startXMLHttpRequest(emit: (entry: NetworkLogPayload) => void): () => void {
  const release = acquireCollector(Symbol('network'), (record) => {
    if (fetchCaptureDepth > 0 || /\/symbolicate$/.test(record.url)) {
      return;
    }
    emit({
      timestamp: record.startedAt,
      duration: record.durationMs,
      request: {
        url: record.url,
        method: record.method,
        headers: record.requestHeaders,
        body: record.requestBody,
      },
      response: {
        status: record.status,
        statusText: record.statusText,
        headers: record.responseHeaders,
        data: parseBody(record.responseBody),
        success: record.status >= 200 && record.status < 300,
      },
      error: record.error,
    });
  });
  const stop = () => {
    release();
    activeReleases.delete(stop);
  };
  activeReleases.add(stop);
  return stop;
}

type FetchEmit = (entry: NetworkLogPayload) => void;
const fetchCollectors = new Map<symbol, FetchEmit>();
let restoreFetch: (() => void) | undefined;

function headersToRecord(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  const record: Record<string, string> = {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value: string, key: string) => {
      record[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const pair of headers) {
      if (Array.isArray(pair) && pair.length >= 2) {
        record[String(pair[0])] = String(pair[1]);
      }
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) {
        record[key] = String(value);
      }
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function describeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const url = request ? request.url : input instanceof URL ? input.toString() : String(input);
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const body = typeof init?.body === 'string' && init.body ? init.body : undefined;
  return {
    url,
    method,
    headers: headersToRecord(init?.headers ?? request?.headers),
    body,
  };
}

function shouldReadBody(contentType: string): boolean {
  if (!contentType) {
    return true;
  }
  if (
    contentType.includes('event-stream') ||
    contentType.includes('octet-stream') ||
    contentType.startsWith('image/') ||
    contentType.includes('multipart/')
  ) {
    return false;
  }
  return (
    contentType.includes('json') ||
    contentType.includes('text') ||
    contentType.includes('javascript') ||
    contentType.includes('xml')
  );
}

async function readResponseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!shouldReadBody(contentType)) {
    return undefined;
  }
  const text = await response.clone().text();
  if (!text) {
    return undefined;
  }
  const clipped = text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT)}…` : text;
  return parseBody(clipped);
}

function installFetchCapture(): void {
  if (restoreFetch || typeof globalThis.fetch !== 'function') {
    return;
  }
  const original = globalThis.fetch;
  const patched = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const started = Date.now();
    const request = describeFetch(input, init);
    if (/\/symbolicate$/.test(request.url)) {
      return Reflect.apply(original, globalThis, [input, init]);
    }
    fetchCaptureDepth += 1;
    try {
      const response = await Reflect.apply(original, globalThis, [input, init]);
      readResponseData(response)
        .then((data) => {
          for (const emit of fetchCollectors.values()) {
            emit({
              timestamp: started,
              duration: Date.now() - started,
              request,
              response: {
                status: response.status,
                statusText: response.statusText,
                headers: headersToRecord(response.headers),
                data,
                success: response.ok,
              },
            });
          }
        })
        .catch(() => {
          for (const emit of fetchCollectors.values()) {
            emit({
              timestamp: started,
              duration: Date.now() - started,
              request,
              response: {
                status: response.status,
                statusText: response.statusText,
                headers: headersToRecord(response.headers),
                success: response.ok,
              },
            });
          }
        });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network Error';
      for (const emit of fetchCollectors.values()) {
        emit({
          timestamp: started,
          duration: Date.now() - started,
          request,
          error: message,
        });
      }
      throw error;
    } finally {
      fetchCaptureDepth -= 1;
    }
  }) as typeof fetch;
  globalThis.fetch = patched;
  restoreFetch = () => {
    if (globalThis.fetch === patched) {
      globalThis.fetch = original;
    }
    restoreFetch = undefined;
  };
}

/** Records global fetch, including Expo's native fetch that bypasses XMLHttpRequest. */
export function startFetch(emit: FetchEmit): () => void {
  const owner = Symbol('network-fetch');
  fetchCollectors.set(owner, emit);
  installFetchCapture();
  const stop = () => {
    if (fetchCollectors.get(owner) === emit) {
      fetchCollectors.delete(owner);
    }
    activeReleases.delete(stop);
    if (fetchCollectors.size === 0) {
      restoreFetch?.();
    }
  };
  activeReleases.add(stop);
  return stop;
}

export function resetInterceptors(): void {
  [...activeReleases].forEach((release) => release());
}
