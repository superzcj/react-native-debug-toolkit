import { Platform } from 'react-native';

import { _addDaemonEndpointToNetworkBlacklist } from '../features/network';
import {
  createDebugDeviceReport,
  type DebugDeviceReport,
  type DebugDeviceReportOptions,
} from './deviceReport';

const DEFAULT_TIMEOUT_MS = 3000;

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: unknown;
  },
) => Promise<FetchResponseLike>;

type AbortControllerLike = {
  signal: unknown;
  abort: () => void;
};

export interface ReportToDaemonOptions extends DebugDeviceReportOptions {
  endpoint?: string;
  timeoutMs?: number;
  token?: string;
}

export interface ReportResult {
  ok: boolean;
  endpoint: string;
  report: DebugDeviceReport;
  status?: number;
  deviceId?: string;
  receivedAt?: string;
  logCount?: Record<string, number>;
  error?: string;
}

export function getGlobalFetch(): FetchLike | undefined {
  return (globalThis as { fetch?: FetchLike }).fetch;
}

function createAbortController(): AbortControllerLike | undefined {
  const AbortControllerCtor = (globalThis as {
    AbortController?: new () => AbortControllerLike;
  }).AbortController;
  return AbortControllerCtor ? new AbortControllerCtor() : undefined;
}

export function getDefaultDaemonEndpoint(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3799';
  }
  return 'http://localhost:3799';
}

export function buildDaemonUrl(endpoint: string, path: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
}

async function readResponseBody(response: FetchResponseLike): Promise<unknown> {
  try {
    if (response.json) {
      return await response.json();
    }
    if (response.text) {
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
  } catch {
    return null;
  }
  return null;
}

function readLogCount(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [key, count]) => {
      if (typeof count === 'number') {
        acc[key] = count;
      }
      return acc;
    },
    {},
  );
}

export async function reportDebugDeviceToDaemon(
  options: ReportToDaemonOptions = {},
): Promise<ReportResult> {
  const endpoint = options.endpoint ?? getDefaultDaemonEndpoint();
  const reportUrl = buildDaemonUrl(endpoint, '/report');
  const report = createDebugDeviceReport(options);
  const fetchImpl = getGlobalFetch();

  _addDaemonEndpointToNetworkBlacklist(endpoint);
  _addDaemonEndpointToNetworkBlacklist(reportUrl);

  if (!fetchImpl) {
    return {
      ok: false,
      endpoint,
      report,
      error: 'global fetch is not available',
    };
  }

  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const controller = createAbortController();
  const timeout = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const response = await fetchImpl(reportUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(report),
      signal: controller?.signal,
    });
    const responseBody = await readResponseBody(response);
    const bodyObject = responseBody && typeof responseBody === 'object'
      ? responseBody as Record<string, unknown>
      : {};

    return {
      ok: response.ok && bodyObject.ok === true,
      endpoint,
      report,
      status: response.status,
      deviceId: typeof bodyObject.deviceId === 'string' ? bodyObject.deviceId : undefined,
      receivedAt: typeof bodyObject.receivedAt === 'string' ? bodyObject.receivedAt : undefined,
      logCount: readLogCount(bodyObject.logCount),
      error: response.ok ? undefined : typeof bodyObject.error === 'string' ? bodyObject.error : 'Report failed',
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      report,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
