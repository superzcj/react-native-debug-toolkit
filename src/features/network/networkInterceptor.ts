import type { NetworkLogEntry } from '../../types';
import {
  acquireCollector,
  withXhrInvocationContext,
  type XhrRequestMetadata,
} from '../../utils/xhrService';

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

// Axios and the React Native fetch polyfill share the XHR collector.
export function startXMLHttpRequest(emit: (entry: NetworkLogPayload) => void): () => void {
  const release = acquireCollector(Symbol('network'), (record) => {
    if (/\/symbolicate$/.test(record.url)) {
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
type FetchRequest = {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: unknown;
};
type FetchDescription = {
  request: FetchRequest;
  requestBody?: Promise<string | undefined>;
};
type FetchCollectorSnapshot = readonly [symbol, FetchEmit];
type FetchCapture = {
  started: number;
  request: FetchRequest;
  requestBody?: Promise<string | undefined>;
  collectors: FetchCollectorSnapshot[];
  xhrRequest?: XhrRequestMetadata;
};
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

function contentTypeFromHeaders(headers: Record<string, string> | undefined): string {
  if (!headers) {
    return '';
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-type');
  return entry?.[1] ?? '';
}

function readRequestBody(
  request: Request,
  headers: Record<string, string> | undefined,
): Promise<string | undefined> | undefined {
  if (!request.body || !shouldReadBody(contentTypeFromHeaders(headers))) {
    return undefined;
  }
  try {
    return request.clone().text().then((text) => text || undefined).catch(() => undefined);
  } catch {
    return undefined;
  }
}

function describeFetch(input: RequestInfo | URL, init?: RequestInit): FetchDescription {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  const url = request ? request.url : input instanceof URL ? input.toString() : String(input);
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const headers = headersToRecord(init?.headers ?? request?.headers);
  const hasBodyOverride = init?.body != null;
  const body = hasBodyOverride && typeof init?.body === 'string' && init.body
    ? init.body
    : undefined;
  return {
    request: { url, method, headers, body },
    requestBody: !hasBodyOverride && request ? readRequestBody(request, headers) : undefined,
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

function hasActiveFetchCollector(capture: FetchCapture): boolean {
  return capture.collectors.some(([owner, emit]) => fetchCollectors.get(owner) === emit);
}

function emitFetchEntry(capture: FetchCapture, entry: NetworkLogPayload): void {
  for (const [owner, emit] of capture.collectors) {
    if (fetchCollectors.get(owner) !== emit) {
      continue;
    }
    try {
      emit(entry);
    } catch {
      /* Never interrupt transport or duplicate an entry after an observer error. */
    }
  }
}

function requestForFetch(capture: FetchCapture, body = capture.request.body): FetchRequest {
  if (capture.xhrRequest) {
    return {
      url: capture.xhrRequest.url,
      method: capture.xhrRequest.method,
      headers: capture.xhrRequest.headers,
      body: capture.xhrRequest.body,
    };
  }
  return { ...capture.request, body };
}

function emitFetchResponse(capture: FetchCapture, response: Response, data?: unknown): void {
  const emit = (body = capture.request.body) => {
    emitFetchEntry(capture, {
      timestamp: capture.started,
      duration: Date.now() - capture.started,
      request: requestForFetch(capture, body),
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: headersToRecord(response.headers),
        data,
        success: response.ok,
      },
    });
  };
  if (capture.xhrRequest || !capture.requestBody) {
    emit();
    return;
  }
  capture.requestBody.then(emit, () => emit(undefined));
}

function emitFetchError(capture: FetchCapture, message: string): void {
  const emit = (body = capture.request.body) => {
    emitFetchEntry(capture, {
      timestamp: capture.started,
      duration: Date.now() - capture.started,
      request: requestForFetch(capture, body),
      error: message,
    });
  };
  if (capture.xhrRequest || !capture.requestBody) {
    emit();
    return;
  }
  capture.requestBody.then(emit, () => emit(undefined));
}

function installFetchCapture(): void {
  if (restoreFetch || typeof globalThis.fetch !== 'function') {
    return;
  }
  const original = globalThis.fetch;
  const patched = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const description = describeFetch(input, init);
    if (/\/symbolicate$/.test(description.request.url)) {
      return Reflect.apply(original, globalThis, [input, init]);
    }
    const capture: FetchCapture = {
      started: Date.now(),
      request: description.request,
      requestBody: description.requestBody,
      collectors: [...fetchCollectors.entries()],
    };
    const invocationContext = {
      onRequest: (xhrRequest: XhrRequestMetadata) => {
        capture.xhrRequest = xhrRequest;
        return { shouldSuppress: () => hasActiveFetchCollector(capture) };
      },
    };
    try {
      const response = await withXhrInvocationContext(invocationContext, () => (
        Reflect.apply(original, globalThis, [input, init])
      ));
      readResponseData(response).then(
        (data) => emitFetchResponse(capture, response, data),
        () => emitFetchResponse(capture, response),
      );
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network Error';
      emitFetchError(capture, message);
      throw error;
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
