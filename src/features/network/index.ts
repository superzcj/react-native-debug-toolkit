import { NetworkLogTab } from './NetworkLogTab';

import type { NetworkLogEntry } from '../../types';
import { createChannelFeature } from '../../utils/createChannelFeature';
import { createEventChannel } from '../../utils/createEventChannel';
import { sanitizeDebugLogEntry } from '../../utils/deviceReport';
import { getDefaultLogRuntime, type LogRuntimeContext } from '../../utils/logRuntime';
import { startXMLHttpRequest, resetInterceptors } from './networkInterceptor';
import type { NetworkLogPayload } from './networkInterceptor';

// ─── Utilities ────────────────────────────────────────

function isUrlBlacklisted(url: string, blacklist: Array<string | RegExp>): boolean {
  if (!url) {
    return false;
  }
  return blacklist.some((pattern) => {
    if (!(pattern instanceof RegExp)) {
      return url.includes(pattern);
    }
    // A RegExp can carry lastIndex across requests; matching must be stateless.
    return new RegExp(pattern.source, pattern.flags).test(url);
  });
}

// ─── Feature factory ──────────────────────────────────

const daemonEndpointBlacklist: Array<string | RegExp> = [];

export interface NetworkFeatureConfig {
  excludeUrls?: readonly (string | RegExp)[];
  /** Maximum number of network logs to keep (default: 200) */
  maxLogs?: number;
  /** URLs to filter out from logging */
  blacklist?: Array<string | RegExp>;
}

export const createNetworkFeature = (
  config?: NetworkFeatureConfig,
  runtime: LogRuntimeContext = getDefaultLogRuntime(),
) => {
  const networkChannel = createEventChannel<NetworkLogPayload>();
  const userBlacklist = [...(config?.blacklist ?? []), ...(config?.excludeUrls ?? [])];

  return createChannelFeature<NetworkLogPayload, NetworkLogEntry>(
    () => networkChannel,
    (payload, id) => ({ ...payload, id }),
    {
      name: 'network',
      label: 'Network',
      renderContent: NetworkLogTab,
      maxLogs: config?.maxLogs,
      persist: {
        storage: runtime.logStorage,
        storageKey: runtime.sessionManager.getLogStorageKey('network_logs'),
        maxPersist: 30,
        serialize: (entry) => sanitizeDebugLogEntry(entry),
      },
      beforePush: (payload) => {
        if (isUrlBlacklisted(payload.request.url, [...userBlacklist, ...daemonEndpointBlacklist])) {
          return null;
        }
        return payload;
      },
      onSetup: () => {
        const stopXhr = startXMLHttpRequest((entry) => networkChannel.emit(entry));
        return () => {
          stopXhr();
        };
      },
    },
  );
};

function normalizeDaemonEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return trimmed;
  }
}

export function addToBlacklist(endpoint: string): void {
  const normalized = normalizeDaemonEndpoint(endpoint);
  if (!normalized || daemonEndpointBlacklist.includes(normalized)) {
    return;
  }
  daemonEndpointBlacklist.push(normalized);
}

export function _isNetworkUrlBlacklistedForTesting(url: string): boolean {
  return isUrlBlacklisted(url, daemonEndpointBlacklist);
}

/** Reset module-level state for testing */
export function _resetNetworkForTesting(): void {
  daemonEndpointBlacklist.splice(0, daemonEndpointBlacklist.length);
  resetInterceptors();
}
