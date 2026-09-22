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

// RN fetch and axios both use the shared XHR transport collector.
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

export function resetInterceptors(): void {
  [...activeReleases].forEach((release) => release());
}
