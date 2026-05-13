import { NetworkLogTab } from './NetworkLogTab';

import type { DebugFeature, NetworkLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { KEYS } from '../../utils/debugPreferences';
import { urlRewriter } from '../../utils/urlRewriterRegistry';
import {
  startXMLHttpRequest,
  resetInterceptors,
} from './networkInterceptor';
import type { NetworkLogPayload } from './networkInterceptor';

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

const DEFAULT_MAX_LOGS = 200;
const daemonEndpointBlacklist: Array<string | RegExp> = [];

export interface NetworkFeatureConfig {
  /** Maximum number of network logs to keep (default: 200) */
  maxLogs?: number;
  /** URLs to filter out from logging */
  blacklist?: Array<string | RegExp>;
}

export const createNetworkFeature = (config?: NetworkFeatureConfig): DebugFeature<NetworkLogEntry[]> => {
  const maxLogs = config?.maxLogs ?? DEFAULT_MAX_LOGS;
  const blacklist: Array<string | RegExp> = config?.blacklist ? [...config.blacklist] : [];
  const logStore = createPersistedObservableStore<NetworkLogEntry>({
    storageKey: KEYS.networkLogs,
    maxPersist: 30,
  });
  let initialized = false;
  let unsubscribeLogs: (() => void) | null = null;
  let stopXhrFn: (() => void) | null = null;

  const handleLog = (entry: NetworkLogPayload) => {
    if (isUrlBlacklisted(entry.request.url, [...blacklist, ...daemonEndpointBlacklist])) {
      return;
    }
    logStore.push({ ...entry, id: logStore.nextId() }, maxLogs);
  };

  return {
    name: 'network',
    label: 'Network',
    renderContent: NetworkLogTab,
    setup: () => {
      if (initialized) {
        return;
      }
      unsubscribeLogs = networkChannel.subscribe(handleLog);
      stopXhrFn = startXMLHttpRequest(emitNetworkLog);
      initialized = true;
    },
    getSnapshot: () => logStore.getData(),
    clear: () => {
      logStore.clear();
    },
    cleanup: () => {
      if (!initialized) {
        return;
      }
      urlRewriter.set(null);
      unsubscribeLogs?.();
      unsubscribeLogs = null;
      stopXhrFn?.();
      stopXhrFn = null;
      logStore.clear();
      initialized = false;
    },
    subscribe: (listener) => logStore.subscribe(listener),
  };
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

export function _addDaemonEndpointToNetworkBlacklist(endpoint: string): void {
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
