import {
  buildDaemonUrl,
  getDefaultDaemonEndpoint,
  getGlobalFetch,
} from './reportToDaemon';

const DEFAULT_HEALTH_TIMEOUT_MS = 2000;

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
};

type AbortControllerLike = {
  signal: unknown;
  abort: () => void;
};

export type DaemonConnectionFailureReason =
  | 'fetch_unavailable'
  | 'timeout'
  | 'http'
  | 'invalid_response'
  | 'network';

export type DaemonConnectionResult =
  | {
    ok: true;
    endpoint: string;
    status: number;
  }
  | {
    ok: false;
    endpoint: string;
    reason: DaemonConnectionFailureReason;
    status?: number;
    error?: string;
  };

export interface DaemonConnectionOptions {
  endpoint?: string;
  timeoutMs?: number;
}

function createAbortController(): AbortControllerLike | undefined {
  const AbortControllerCtor = (globalThis as {
    AbortController?: new () => AbortControllerLike;
  }).AbortController;
  return AbortControllerCtor ? new AbortControllerCtor() : undefined;
}

async function readHealthBody(response: FetchResponseLike): Promise<Record<string, unknown> | null> {
  try {
    const body = response.json ? await response.json() : null;
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function checkDaemonConnection(
  options: DaemonConnectionOptions = {},
): Promise<DaemonConnectionResult> {
  const endpoint = options.endpoint ?? getDefaultDaemonEndpoint();
  const healthUrl = buildDaemonUrl(endpoint, '/health');
  const fetchImpl = getGlobalFetch();

  if (!fetchImpl) {
    return {
      ok: false,
      endpoint,
      reason: 'fetch_unavailable',
      error: 'global fetch is not available',
    };
  }

  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
  const controller = createAbortController();
  let timedOut = false;
  const timeout = controller && timeoutMs > 0
    ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs)
    : undefined;

  try {
    const response = await fetchImpl(healthUrl, {
      method: 'GET',
      headers: {},
      signal: controller?.signal,
    });
    const body = await readHealthBody(response);

    if (!response.ok) {
      return {
        ok: false,
        endpoint,
        reason: 'http',
        status: response.status,
      };
    }

    if (body?.ok !== true) {
      return {
        ok: false,
        endpoint,
        reason: 'invalid_response',
        status: response.status,
      };
    }

    return {
      ok: true,
      endpoint,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      reason: timedOut ? 'timeout' : 'network',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
