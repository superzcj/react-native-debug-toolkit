import { AppState, type AppStateStatus } from 'react-native';

import { DebugToolkit } from '../core/DebugToolkit';
import { _addDaemonEndpointToNetworkBlacklist } from '../features/network';
import { createDebugDeviceReport } from './deviceReport';
import {
  buildDaemonUrl,
  getDefaultDaemonEndpoint,
  getGlobalFetch,
} from './reportToDaemon';
import { safeStringify } from './safeStringify';

export interface StreamToDaemonOptions {
  endpoint?: string;
  token?: string;
  debounceMs?: number;
  timeoutMs?: number;
  maxRetryAttempts?: number | null;
  onStatus?: (status: StreamStatus) => void;
}

export type StreamStatus =
  | { state: 'connecting' }
  | { state: 'connected'; deviceId: string }
  | { state: 'retrying'; retryInMs: number }
  | { state: 'failed'; reason: 'auth' | 'retry_limit' };

const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_TIMEOUT_MS = 3000;
const RETRY_BASE_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const BACKGROUND_RESYNC_THRESHOLD_MS = 5 * 60 * 1000;
type SendResult = 'ok' | 'retry' | 'auth_failed';

type FetchHeaders = Record<string, string>;

interface StreamState {
  endpoint: string;
  reportUrl: string;
  ingestUrl: string;
  token: string | undefined;
  debounceMs: number;
  timeoutMs: number;
  deviceId: string | null;
  sending: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  maxRetryAttempts: number | null;
  dirtyFeatures: Set<string>;
  lastSentIds: Map<string, Set<string | number>>;
  featureUnsubscribes: Array<() => void>;
  appStateUnsubscribe: (() => void) | null;
  backgroundedAt: number | null;
  onStatus: ((status: StreamStatus) => void) | undefined;
}

let active: StreamState | null = null;

type AbortControllerLike = {
  signal: unknown;
  abort: () => void;
};

function createAbortController(): AbortControllerLike | undefined {
  const AbortControllerCtor = (globalThis as {
    AbortController?: new () => AbortControllerLike;
  }).AbortController;
  return AbortControllerCtor ? new AbortControllerCtor() : undefined;
}

function getEntryId(entry: unknown): string | number | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = (entry as Record<string, unknown>).id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

function snapshotToIds(snapshot: unknown[]): Set<string | number> {
  return new Set(
    snapshot
      .map(getEntryId)
      .filter((id): id is string | number => id != null),
  );
}

function fetchHeaders(state: StreamState): FetchHeaders {
  const headers: FetchHeaders = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return headers;
}

function emitStatus(state: StreamState, status: StreamStatus): void {
  try {
    state.onStatus?.(status);
  } catch {
    // Consumer status callbacks should not affect log delivery.
  }
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function failStreaming(state: StreamState, reason: 'auth' | 'retry_limit'): void {
  if (active !== state) return;
  emitStatus(state, { state: 'failed', reason });
  stopStreaming();
}

async function doPost(
  url: string,
  headers: FetchHeaders,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; json?: () => Promise<unknown> } | null> {
  const fetchImpl = getGlobalFetch();
  if (!fetchImpl) {
    return null;
  }
  const controller = createAbortController();
  const timeout = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers,
      body: safeStringify(body),
      signal: controller?.signal,
    });
  } catch {
    return null;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function resetRetry(state: StreamState): void {
  state.retryAttempt = 0;
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
}

function scheduleRetry(state: StreamState): void {
  if (state.retryTimer) return;
  if (state.maxRetryAttempts !== null && state.retryAttempt >= state.maxRetryAttempts) {
    failStreaming(state, 'retry_limit');
    return;
  }
  const delay = Math.min(
    RETRY_BASE_MS * (2 ** state.retryAttempt),
    MAX_RETRY_DELAY_MS,
  );
  state.retryAttempt += 1;
  emitStatus(state, { state: 'retrying', retryInMs: delay });
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    if (active !== state) return;
    if (state.deviceId) {
      sendDelta(state);
    } else {
      sendFullReport(state);
    }
  }, delay);
}

async function sendFullReport(state: StreamState): Promise<void> {
  if (state.sending) return;
  state.sending = true;
  let result: SendResult = 'ok';
  try {
    result = await doSendFullReport(state);
    if (result === 'ok') resetRetry(state);
  } finally {
    state.sending = false;
    if (active !== state) return;
    if (result === 'auth_failed') {
      failStreaming(state, 'auth');
    } else if (result === 'retry') {
      scheduleRetry(state);
    } else if (state.dirtyFeatures.size > 0 && !state.debounceTimer) {
      scheduleDelta(state);
    }
  }
}

async function doSendFullReport(state: StreamState): Promise<SendResult> {
  const report = createDebugDeviceReport();
  const response = await doPost(state.reportUrl, fetchHeaders(state), report, state.timeoutMs);
  if (!response) return 'retry';
  if (isAuthFailure(response.status)) return 'auth_failed';
  if (response.status < 200 || response.status >= 300) return 'retry';

  try {
    const body = response.json
      ? (await response.json()) as Record<string, unknown> | null
      : null;
    if (body?.ok !== true || typeof body.deviceId !== 'string') return 'retry';
    state.deviceId = body.deviceId;
    emitStatus(state, { state: 'connected', deviceId: body.deviceId });
  } catch {
    return 'retry';
  }

  state.lastSentIds.clear();
  for (const feature of DebugToolkit.features) {
    try {
      const snapshot = feature.getSnapshot();
      if (Array.isArray(snapshot)) state.lastSentIds.set(feature.name, snapshotToIds(snapshot));
    } catch {
      // skip
    }
  }
  return 'ok';
}

async function sendDelta(state: StreamState): Promise<void> {
  if (state.sending || state.dirtyFeatures.size === 0) return;
  state.sending = true;
  let retry = false;
  try {
    const delta: Record<string, unknown[]> = {};
    const nextSentIds = new Map<string, Set<string | number>>();
    const features = DebugToolkit.features;

    for (const featureName of state.dirtyFeatures) {
      const feature = features.find((f) => f.name === featureName);
      if (!feature) continue;

      let snapshot: unknown;
      try {
        snapshot = feature.getSnapshot();
      } catch {
        continue;
      }

      if (!Array.isArray(snapshot)) continue;

      const prevIds = state.lastSentIds.get(featureName) || new Set<string | number>();
      const newEntries = snapshot.filter(
        (entry) => {
          const id = getEntryId(entry);
          return id != null && !prevIds.has(id);
        },
      );

      if (newEntries.length > 0) {
        delta[featureName] = newEntries;
        nextSentIds.set(featureName, snapshotToIds(snapshot));
      }
    }

    state.dirtyFeatures.clear();
    state.debounceTimer = null;

    if (Object.keys(delta).length === 0) return;

    if (!state.deviceId) {
      const result = await doSendFullReport(state);
      retry = result === 'retry';
      if (result !== 'ok') Object.keys(delta).forEach((featureName) => state.dirtyFeatures.add(featureName));
      if (result === 'auth_failed') failStreaming(state, 'auth');
      if (result === 'ok') resetRetry(state);
      return;
    }

    const response = await doPost(
      state.ingestUrl,
      fetchHeaders(state),
      { deviceId: state.deviceId, delta: { logs: delta } },
      state.timeoutMs,
    );
    if (!response) {
      Object.keys(delta).forEach((featureName) => state.dirtyFeatures.add(featureName));
      retry = true;
      return;
    }

    if (response.status === 404) {
      state.deviceId = null;
      state.lastSentIds.clear();
      const result = await doSendFullReport(state);
      retry = result === 'retry';
      if (result !== 'ok') Object.keys(delta).forEach((featureName) => state.dirtyFeatures.add(featureName));
      if (result === 'auth_failed') failStreaming(state, 'auth');
      if (result === 'ok') resetRetry(state);
      return;
    }

    if (isAuthFailure(response.status)) {
      Object.keys(delta).forEach((featureName) => state.dirtyFeatures.add(featureName));
      failStreaming(state, 'auth');
      return;
    }

    if (response.status < 200 || response.status >= 300) {
      Object.keys(delta).forEach((featureName) => state.dirtyFeatures.add(featureName));
      retry = true;
      return;
    }

    nextSentIds.forEach((ids, featureName) => {
      state.lastSentIds.set(featureName, ids);
    });
    resetRetry(state);
    if (state.deviceId) {
      emitStatus(state, { state: 'connected', deviceId: state.deviceId });
    }
  } finally {
    state.sending = false;
    if (active !== state) return;
    if (retry && state.dirtyFeatures.size > 0) {
      scheduleRetry(state);
    } else if (state.dirtyFeatures.size > 0 && !state.debounceTimer) {
      scheduleDelta(state);
    }
  }
}

function scheduleDelta(state: StreamState): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    if (active === state) sendDelta(state);
  }, state.debounceMs);
}

function onFeatureChange(featureName: string): void {
  if (!active) return;
  active.dirtyFeatures.add(featureName);
  if (active.retryTimer) return;
  scheduleDelta(active);
}

function handleAppStateChange(nextState: AppStateStatus): void {
  if (!active) return;
  if (nextState === 'background') {
    active.backgroundedAt = Date.now();
    if (active.debounceTimer) {
      clearTimeout(active.debounceTimer);
      active.debounceTimer = null;
    }
    sendDelta(active);
  } else if (nextState === 'active') {
    const wasAway = active.backgroundedAt ? Date.now() - active.backgroundedAt : 0;
    active.backgroundedAt = null;

    if (wasAway > BACKGROUND_RESYNC_THRESHOLD_MS || !active.deviceId) {
      active.deviceId = null;
      active.lastSentIds.clear();
      sendFullReport(active);
    }
  }
}

export function startStreaming(options: StreamToDaemonOptions = {}): void {
  if (active) return;

  const endpoint = options.endpoint || getDefaultDaemonEndpoint();
  const reportUrl = buildDaemonUrl(endpoint, '/report');
  const ingestUrl = buildDaemonUrl(endpoint, '/ingest');

  _addDaemonEndpointToNetworkBlacklist(endpoint);
  _addDaemonEndpointToNetworkBlacklist(reportUrl);
  _addDaemonEndpointToNetworkBlacklist(ingestUrl);

  const state: StreamState = {
    endpoint,
    reportUrl,
    ingestUrl,
    token: options.token,
    debounceMs: options.debounceMs || DEFAULT_DEBOUNCE_MS,
    timeoutMs: Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    deviceId: null,
    sending: false,
    debounceTimer: null,
    retryTimer: null,
    retryAttempt: 0,
    maxRetryAttempts: typeof options.maxRetryAttempts === 'number'
      ? Math.max(0, Math.floor(options.maxRetryAttempts))
      : null,
    dirtyFeatures: new Set(),
    lastSentIds: new Map(),
    featureUnsubscribes: [],
    appStateUnsubscribe: null,
    backgroundedAt: null,
    onStatus: options.onStatus,
  };

  for (const feature of DebugToolkit.features) {
    if (!feature.subscribe) continue;
    const unsub = feature.subscribe(() => { onFeatureChange(feature.name); });
    state.featureUnsubscribes.push(unsub);
  }

  state.appStateUnsubscribe = AppState.addEventListener('change', handleAppStateChange).remove;
  active = state;

  emitStatus(active, { state: 'connecting' });
  sendFullReport(active);
}

export function stopStreaming(): void {
  if (!active) return;
  const state = active;
  active = null;

  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  if (state.retryTimer) clearTimeout(state.retryTimer);
  state.featureUnsubscribes.forEach((fn) => fn());
  state.appStateUnsubscribe?.();
}

export function isStreaming(): boolean {
  return active !== null;
}
