import { NetworkLogTab } from './NetworkLogTab';

import type { NetworkLogEntry } from '../../types';
import { createChannelFeature } from '../../utils/createChannelFeature';
import { createEventChannel } from '../../utils/createEventChannel';
import { KEYS } from '../../utils/debugPreferences';
import {
  startXMLHttpRequest,
  resetInterceptors,
} from './networkInterceptor';
import type { NetworkLogPayload } from './networkInterceptor';
import { setUrlRewriter as setInterceptorUrlRewriter } from '../../utils/urlRewriter';

// ─── Utilities ────────────────────────────────────────

function isUrlBlacklisted(
  url: string,
  blacklist: Array<string | RegExp>,
): boolean {
  if (!url) {
    return false;
  }
  return blacklist.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(url) : url.includes(pattern),
  );
}

// ─── Channel (shared pub-sub backbone) ─────────────────

let networkChannel = createEventChannel<NetworkLogPayload>();

function emitNetworkLog(entry: NetworkLogPayload): void {
  networkChannel.emit(entry);
}

// ─── Feature factory ──────────────────────────────────

const daemonEndpointBlacklist: Array<string | RegExp> = [];

export interface NetworkFeatureConfig {
  /** Maximum number of network logs to keep (default: 200) */
  maxLogs?: number;
  /** URLs to filter out from logging */
  blacklist?: Array<string | RegExp>;
}

export const createNetworkFeature = (config?: NetworkFeatureConfig) => {
  const userBlacklist = config?.blacklist ? [...config.blacklist] : [];

  return createChannelFeature<NetworkLogPayload, NetworkLogEntry>(
    () => networkChannel,
    (payload, id) => ({ ...payload, id }),
    {
      name: 'network',
      label: 'Network',
      renderContent: NetworkLogTab,
      maxLogs: config?.maxLogs,
      persist: { storageKey: KEYS.networkLogs, maxPersist: 30 },
      beforePush: (payload) => {
        if (isUrlBlacklisted(payload.request.url, [...userBlacklist, ...daemonEndpointBlacklist])) {
          return null;
        }
        return payload;
      },
      onSetup: () => {
        const stopXhr = startXMLHttpRequest(emitNetworkLog);
        return () => {
          setInterceptorUrlRewriter(null);
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
  networkChannel = createEventChannel<NetworkLogPayload>();
  daemonEndpointBlacklist.splice(0, daemonEndpointBlacklist.length);
  resetInterceptors();
}
