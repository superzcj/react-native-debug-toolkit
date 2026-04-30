import type { NetworkLogEntry } from '../../types';
import { urlRewriter } from '../../utils/urlRewriterRegistry';

type NetworkLogPayload = Omit<NetworkLogEntry, 'id'>;

// Intercepts fetch requests and optionally axios via interceptors.
// Axios response data is captured directly through interceptor callbacks,
// avoiding the unreliable XHR response interception in React Native.

// ─── Minimal axios interface (no hard dependency) ──────

export interface AxiosInstanceLike {
  interceptors: {
    request: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      use(onFulfilled?: (config: any) => any, onRejected?: (error: any) => any): number;
      eject(id: number): void;
    };
    response: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      use(onFulfilled?: (response: any) => any, onRejected?: (error: any) => any): number;
      eject(id: number): void;
    };
  };
}

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

function headersToObject(
  headers: Record<string, string> | Headers | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }
  if (typeof (headers as Headers).forEach === 'function') {
    (headers as Headers).forEach((value: string, key: string) => {
      result[key] = value;
    });
    return result;
  }
  Object.keys(headers).forEach((key) => {
    result[key] = (headers as Record<string, string>)[key]!;
  });
  return result;
}

function getRequestSnapshot(
  input: unknown,
  init?: RequestInit,
): NetworkLogEntry['request'] {
  const request = input instanceof Request ? input : null;
  return {
    url: typeof input === 'string' ? input : request?.url ?? String(input),
    method: (init?.method || request?.method || 'GET').toUpperCase(),
    headers: init?.headers
      ? headersToObject(init.headers as Record<string, string> | Headers)
      : request?.headers
        ? headersToObject(request.headers)
        : undefined,
    body: init?.body,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const raw = await response.clone().text();
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function normalizeAxiosHeaders(
  headers: unknown,
): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }
  // AxiosHeaders instance
  if (typeof (headers as Record<string, unknown>).forEach === 'function') {
    const result: Record<string, string> = {};
    (headers as { forEach(fn: (value: string, key: string) => void): void }).forEach(
      (value, key) => {
        result[key] = value;
      },
    );
    return Object.keys(result).length > 0 ? result : undefined;
  }
  // Plain object
  const result: Record<string, string> = {};
  const obj = headers as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      result[key] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildFullUrl(config: {
  baseURL?: string;
  url?: string;
}): string {
  const base = config.baseURL ?? '';
  const url = config.url ?? '';
  if (!base || url.startsWith('http')) {
    return url;
  }
  return base.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
}

// ─── Fetch interceptor ─────────────────────────────────

let originalFetch: typeof globalThis.fetch | null = null;
let fetchRefCount = 0;

function stopFetch(): void {
  fetchRefCount = Math.max(0, fetchRefCount - 1);
  if (fetchRefCount === 0 && originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}

export function startFetch(emit: (entry: NetworkLogPayload) => void): () => void {
  fetchRefCount += 1;
  if (originalFetch) {
    return () => {
      stopFetch();
    };
  }

  originalFetch = globalThis.fetch;

  globalThis.fetch = async function interceptedFetch(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) {
    const startTime = Date.now();

    let rewrittenInput: typeof input = input;
    if (urlRewriter.get()) {
      if (typeof input === 'string') {
        rewrittenInput = rewriteUrl(input);
      } else if (input instanceof Request) {
        rewrittenInput = new Request(rewriteUrl(input.url), input as RequestInit);
      }
    }

    const request = getRequestSnapshot(rewrittenInput, init);

    try {
      const response = await originalFetch!.call(globalThis, rewrittenInput, init);
      const duration = Date.now() - startTime;

      try {
        const data = await parseResponseBody(response);
        emit({
          timestamp: startTime,
          duration,
          request,
          response: { status: response.status, statusText: response.statusText, data },
        });
      } catch {
        emit({
          timestamp: startTime,
          duration,
          request,
          response: { status: response.status, statusText: response.statusText },
        });
      }

      return response;
    } catch (error) {
      emit({
        timestamp: startTime,
        duration: Date.now() - startTime,
        request,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return () => {
    stopFetch();
  };
}

// ─── Axios interceptor ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingAxiosRequests = new WeakMap<any, { startTime: number; timestamp: number }>();

export function startAxios(
  axiosInstance: AxiosInstanceLike,
  emit: (entry: NetworkLogPayload) => void,
): () => void {
  const requestInterceptorId = axiosInstance.interceptors.request.use(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config: any) => {
      const now = Date.now();
      pendingAxiosRequests.set(config, { startTime: now, timestamp: now });

      if (urlRewriter.get() && config.url) {
        const fullUrl = buildFullUrl(config);
        const rewritten = rewriteUrl(fullUrl);
        if (rewritten !== fullUrl) {
          config.url = rewritten;
          if (config.baseURL) {
            config.baseURL = undefined;
          }
        }
      }

      return config;
    },
  );

  const responseInterceptorId = axiosInstance.interceptors.response.use(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response: any) => {
      const config = response.config;
      const pending = config ? pendingAxiosRequests.get(config) : undefined;
      const startTime = pending?.timestamp ?? Date.now();

      emit({
        timestamp: startTime,
        duration: Date.now() - startTime,
        request: {
          url: buildFullUrl(config),
          method: (config?.method ?? 'GET').toUpperCase(),
          headers: normalizeAxiosHeaders(config?.headers),
          body: config?.data,
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: normalizeAxiosHeaders(response.headers),
          data: response.data,
          success: response.status >= 200 && response.status < 300,
        },
      });

      return response;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error: any) => {
      const config = error.config;
      const pending = config ? pendingAxiosRequests.get(config) : undefined;
      const startTime = pending?.timestamp ?? Date.now();

      if (config) {
        emit({
          timestamp: startTime,
          duration: Date.now() - startTime,
          request: {
            url: buildFullUrl(config),
            method: (config.method ?? 'GET').toUpperCase(),
            headers: normalizeAxiosHeaders(config.headers),
            body: config.data,
          },
          response: error.response
            ? {
                status: error.response.status,
                statusText: error.response.statusText,
                headers: normalizeAxiosHeaders(error.response.headers),
                data: error.response.data,
                success: false,
              }
            : undefined,
          error: error.message ?? String(error),
        });
      }

      return Promise.reject(error);
    },
  );

  return () => {
    axiosInstance.interceptors.request.eject(requestInterceptorId);
    axiosInstance.interceptors.response.eject(responseInterceptorId);
  };
}

// ─── Cleanup ───────────────────────────────────────────

export function resetInterceptors(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  fetchRefCount = 0;
}
