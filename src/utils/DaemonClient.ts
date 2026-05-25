import { AppState, type AppStateStatus, Platform } from 'react-native';

import { debugToolkit } from '../core/DebugToolkit';
import type { FeatureDataProvider } from '../types';
import {
  createDebugDeviceReport,
  type DebugDeviceReport,
  type DebugDeviceReportOptions,
  type SessionInfo,
} from './deviceReport';
import { safeStringify } from './safeStringify';

// ---- Public Types ----

export type DaemonConnectionMode = 'simulator' | 'device';

export interface DaemonSettings {
  mode: DaemonConnectionMode;
  endpoint: string;
  deviceHost: string;
  token: string;
}

export type StreamStatus =
  | { state: 'connecting' }
  | { state: 'connected'; deviceId: string }
  | { state: 'retrying'; retryInMs: number }
  | { state: 'failed'; reason: 'auth' | 'retry_limit' };

export interface StreamToDaemonOptions {
  endpoint?: string;
  token?: string;
  debounceMs?: number;
  timeoutMs?: number;
  maxRetryAttempts?: number | null;
  onStatus?: (status: StreamStatus) => void;
}

export type DaemonConnectionFailureReason =
  | 'fetch_unavailable'
  | 'timeout'
  | 'http'
  | 'invalid_response'
  | 'network';

export type DaemonConnectionResult =
  | { ok: true; endpoint: string; status: number }
  | { ok: false; endpoint: string; reason: DaemonConnectionFailureReason; status?: number; error?: string };

export interface DaemonConnectionOptions {
  endpoint?: string;
  timeoutMs?: number;
}

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

// ---- Internal Transport Types ----

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: unknown;
}) => Promise<FetchResponseLike>;

type AbortControllerLike = { signal: unknown; abort: () => void };
type AbortControllerCtor = new () => AbortControllerLike;

type SendResult = 'ok' | 'retry' | 'auth_failed';

// ---- Constants ----

const DEFAULT_HEALTH_TIMEOUT_MS = 2000;
const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_REPORT_TIMEOUT_MS = 3000;
const RETRY_BASE_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const BACKGROUND_RESYNC_THRESHOLD_MS = 5 * 60 * 1000;

// ---- Standalone Utilities (also used internally) ----

export function getDefaultDaemonEndpoint(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3799';
  }
  return 'http://localhost:3799';
}

export function buildDeviceDaemonEndpoint(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!url.port) url.port = '3799';
    return url.toString().replace(/\/$/, '');
  } catch {
    return withProtocol;
  }
}

export function normalizeDaemonSettings(settings: DaemonSettings): {
  endpoint?: string;
  token?: string;
} {
  const endpoint = settings.mode === 'device'
    ? buildDeviceDaemonEndpoint(settings.deviceHost)
    : '';
  const token = settings.token.trim();
  return {
    endpoint: endpoint || undefined,
    token: token || undefined,
  };
}

// ---- Stream State (internal) ----

interface StreamState {
  endpoint: string;
  reportUrl: string;
  ingestUrl: string;
  token: string | undefined;
  debounceMs: number;
  timeoutMs: number;
  deviceId: string | null;
  session: SessionInfo;
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

// ---- DaemonClient ----

export interface DaemonClientOptions {
  fetch?: FetchLike;
  AbortController?: AbortControllerCtor;
  featureProvider: FeatureDataProvider;
  onEndpointDetected?: (url: string) => void;
}

export class DaemonClient {
  private _settings: DaemonSettings = {
    mode: 'simulator',
    endpoint: '',
    deviceHost: '',
    token: '',
  };
  private _streamingEnabled: boolean | null = null;
  private _stream: StreamState | null = null;
  private _fetch: FetchLike | undefined;
  private _AbortController: AbortControllerCtor | undefined;
  private _featureProvider: FeatureDataProvider;
  private _onEndpointDetected: ((url: string) => void) | undefined;
  private _restorePromise: Promise<void> | null = null;
  private _sessionId: SessionInfo | null = null;

  constructor(options: DaemonClientOptions) {
    this._fetch = options.fetch;
    this._AbortController = options.AbortController;
    this._featureProvider = options.featureProvider;
    this._onEndpointDetected = options.onEndpointDetected;
  }

  // --- Settings ---

  getSettings(): DaemonSettings {
    return { ...this._settings };
  }

  configure(settings: DaemonSettings): void {
    const normalized = normalizeDaemonSettings(settings);
    this._settings = {
      mode: settings.mode,
      deviceHost: settings.deviceHost.trim(),
      endpoint: normalized.endpoint || '',
      token: settings.token.trim(),
    };
  }

  // --- Connection Health Check ---

  async checkConnection(
    options: DaemonConnectionOptions = {},
  ): Promise<DaemonConnectionResult> {
    const endpoint = options.endpoint ?? getDefaultDaemonEndpoint();
    const healthUrl = buildDaemonUrl(endpoint, '/health');
    const fetchImpl = this.resolveFetch();

    if (!fetchImpl) {
      return {
        ok: false,
        endpoint,
        reason: 'fetch_unavailable',
        error: 'global fetch is not available',
      };
    }

    const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
    const controller = this.createAbortController();
    let timedOut = false;
    const timeout = controller && timeoutMs > 0
      ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs)
      : undefined;

    try {
      const response = await fetchImpl(healthUrl, {
        method: 'GET',
        headers: {},
        signal: controller?.signal,
      });
      const body = await readHealthBody(response);

      if (!response.ok) {
        return { ok: false, endpoint, reason: 'http', status: response.status };
      }
      if (body?.ok !== true) {
        return { ok: false, endpoint, reason: 'invalid_response', status: response.status };
      }
      return { ok: true, endpoint, status: response.status };
    } catch (error) {
      return {
        ok: false,
        endpoint,
        reason: timedOut ? 'timeout' : 'network',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // --- Streaming ---

  connect(options: StreamToDaemonOptions = {}): void {
    if (this._stream) return;

    if (!this._sessionId) {
      this._sessionId = { id: generateSessionId(), startedAt: Date.now() };
    }

    const endpoint = options.endpoint || this.resolveEndpoint();
    const reportUrl = buildDaemonUrl(endpoint, '/report');
    const ingestUrl = buildDaemonUrl(endpoint, '/ingest');

    this.notifyEndpoint(endpoint);
    this.notifyEndpoint(reportUrl);
    this.notifyEndpoint(ingestUrl);

    const state: StreamState = {
      endpoint,
      reportUrl,
      ingestUrl,
      token: options.token ?? (this._settings.token.trim() || undefined),
      debounceMs: options.debounceMs || DEFAULT_DEBOUNCE_MS,
      timeoutMs: Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      deviceId: null,
      session: this._sessionId,
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

    for (const feature of this._featureProvider.features) {
      if (!feature.subscribe) continue;
      const unsub = feature.subscribe(() => { this.onFeatureChange(feature.name); });
      state.featureUnsubscribes.push(unsub);
    }

    state.appStateUnsubscribe = AppState.addEventListener(
      'change',
      (nextState) => { this.handleAppStateChange(nextState); },
    ).remove;

    this._stream = state;
    this.emitStatus({ state: 'connecting' });
    this.enqueueSendFullReport();
  }

  disconnect(): void {
    if (!this._stream) return;
    const state = this._stream;
    this._stream = null;
    this._sessionId = null;

    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    if (state.retryTimer) clearTimeout(state.retryTimer);
    state.featureUnsubscribes.forEach((fn) => fn());
    state.appStateUnsubscribe?.();
  }

  isConnected(): boolean {
    return this._stream !== null;
  }

  getStatus(): StreamStatus | null {
    if (!this._stream) return null;
    if (this._stream.deviceId) {
      return { state: 'connected', deviceId: this._stream.deviceId };
    }
    if (this._stream.retryTimer) {
      return {
        state: 'retrying',
        retryInMs: Math.min(
          RETRY_BASE_MS * (2 ** this._stream.retryAttempt),
          MAX_RETRY_DELAY_MS,
        ),
      };
    }
    return { state: 'connecting' };
  }

  setStreamingEnabled(enabled: boolean): void {
    this._streamingEnabled = enabled;
  }

  setEndpointDetector(callback: (url: string) => void): void {
    this._onEndpointDetected = callback;
  }

  // --- Restore (init-time reconnect) ---

  async restore(): Promise<void> {
    if (this._restorePromise) return this._restorePromise;
    this._restorePromise = this.doRestore().finally(() => {
      this._restorePromise = null;
    });
    return this._restorePromise;
  }

  private async doRestore(): Promise<void> {
    if (this.isConnected()) return;

    const enabled = this._streamingEnabled;
    const options = normalizeDaemonSettings(this._settings);

    if (enabled === false) return;
    if (enabled === true) {
      this.connect();
      return;
    }

    const canProbe = this._settings.mode === 'simulator'
      || Boolean(this._settings.deviceHost.trim());
    if (!canProbe) return;

    const endpoint = options.endpoint || this.resolveEndpoint();
    const connection = await this.checkConnection({
      ...options,
      endpoint,
      timeoutMs: 1000,
    });

    if (!connection.ok || this.isConnected()) return;

    this._streamingEnabled = true;
    this.connect();
  }

  // --- One-shot Report ---

  async reportOnce(options: ReportToDaemonOptions = {}): Promise<ReportResult> {
    const endpoint = options.endpoint ?? this.resolveEndpoint();
    const reportUrl = buildDaemonUrl(endpoint, '/report');
    const report = createDebugDeviceReport(options);
    const fetchImpl = this.resolveFetch();

    this.notifyEndpoint(endpoint);
    this.notifyEndpoint(reportUrl);

    if (!fetchImpl) {
      return { ok: false, endpoint, report, error: 'global fetch is not available' };
    }

    const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_REPORT_TIMEOUT_MS);
    const controller = this.createAbortController();
    const timeout = controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.token) headers.Authorization = `Bearer ${options.token}`;

      const response = await fetchImpl(reportUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(report),
        signal: controller?.signal,
      });

      const bodyObject = await readReportResponseBody(response);
      const logCount = readLogCount(bodyObject.logCount);

      return {
        ok: response.ok && bodyObject.ok === true,
        endpoint,
        report,
        status: response.status,
        deviceId: typeof bodyObject.deviceId === 'string' ? bodyObject.deviceId : undefined,
        receivedAt: typeof bodyObject.receivedAt === 'string' ? bodyObject.receivedAt : undefined,
        logCount,
        error: response.ok
          ? undefined
          : typeof bodyObject.error === 'string'
            ? bodyObject.error
            : 'Report failed',
      };
    } catch (error) {
      return {
        ok: false,
        endpoint,
        report,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // --- Test Helpers ---

  _resetForTesting(): void {
    this.disconnect();
    this._settings = { mode: 'simulator', endpoint: '', deviceHost: '', token: '' };
    this._streamingEnabled = null;
    this._restorePromise = null;
    this._sessionId = null;
  }

  // ---- Private: Transport ----

  private resolveEndpoint(): string {
    const normalized = normalizeDaemonSettings(this._settings);
    return normalized.endpoint || getDefaultDaemonEndpoint();
  }

  private resolveFetch(): FetchLike | undefined {
    return this._fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
  }

  private createAbortController(): AbortControllerLike | undefined {
    if (this._AbortController) return new this._AbortController();
    const Ctor = (globalThis as { AbortController?: AbortControllerCtor }).AbortController;
    return Ctor ? new Ctor() : undefined;
  }

  private notifyEndpoint(url: string): void {
    this._onEndpointDetected?.(url);
  }

  private emitStatus(status: StreamStatus): void {
    try {
      this._stream?.onStatus?.(status);
    } catch {
      // Consumer callbacks must not affect delivery.
    }
  }

  private async doPost(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
  ): Promise<{ status: number; json?: () => Promise<unknown> } | null> {
    const fetchImpl = this.resolveFetch();
    if (!fetchImpl) return null;
    const controller = this.createAbortController();
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
      if (timeout) clearTimeout(timeout);
    }
  }

  // ---- Private: Streaming State Machine ----

  private emitStreamStatus(state: StreamState, status: StreamStatus): void {
    try {
      state.onStatus?.(status);
    } catch {
      // Consumer callbacks must not affect delivery.
    }
  }

  private resetRetry(state: StreamState): void {
    state.retryAttempt = 0;
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }
  }

  private failStreaming(state: StreamState, reason: 'auth' | 'retry_limit'): void {
    if (this._stream !== state) return;
    this.emitStreamStatus(state, { state: 'failed', reason });
    this.disconnect();
  }

  private scheduleRetry(state: StreamState): void {
    if (state.retryTimer) return;
    if (state.maxRetryAttempts !== null && state.retryAttempt >= state.maxRetryAttempts) {
      this.failStreaming(state, 'retry_limit');
      return;
    }
    const delay = Math.min(RETRY_BASE_MS * (2 ** state.retryAttempt), MAX_RETRY_DELAY_MS);
    state.retryAttempt += 1;
    this.emitStreamStatus(state, { state: 'retrying', retryInMs: delay });
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null;
      if (this._stream !== state) return;
      if (state.deviceId) {
        this.enqueueSendDelta();
      } else {
        this.enqueueSendFullReport();
      }
    }, delay);
  }

  private scheduleDelta(state: StreamState): void {
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      if (this._stream === state) this.enqueueSendDelta();
    }, state.debounceMs);
  }

  private onFeatureChange(featureName: string): void {
    if (!this._stream) return;
    this._stream.dirtyFeatures.add(featureName);
    if (this._stream.retryTimer) return;
    this.scheduleDelta(this._stream);
  }

  private handleAppStateChange(nextState: AppStateStatus): void {
    if (!this._stream) return;
    const state = this._stream;

    if (nextState === 'background') {
      state.backgroundedAt = Date.now();
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }
      this.enqueueSendDelta();
    } else if (nextState === 'active') {
      const wasAway = state.backgroundedAt ? Date.now() - state.backgroundedAt : 0;
      state.backgroundedAt = null;
      if (wasAway > BACKGROUND_RESYNC_THRESHOLD_MS || !state.deviceId) {
        state.deviceId = null;
        state.lastSentIds.clear();
        this.enqueueSendFullReport();
      }
    }
  }

  private fetchHeaders(state: StreamState): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    return headers;
  }

  // ---- Private: Full Report ----

  private enqueueSendFullReport(): void {
    const state = this._stream;
    if (!state || state.sending) return;
    state.sending = true;

    (async () => {
      let result: SendResult = 'ok';
      try {
        result = await this.doSendFullReport(state);
        if (result === 'ok') this.resetRetry(state);
      } finally {
        state.sending = false;
        if (this._stream !== state) return;
        if (result === 'auth_failed') {
          this.failStreaming(state, 'auth');
        } else if (result === 'retry') {
          this.scheduleRetry(state);
        } else if (state.dirtyFeatures.size > 0 && !state.debounceTimer) {
          this.scheduleDelta(state);
        }
      }
    })();
  }

  private async doSendFullReport(state: StreamState): Promise<SendResult> {
    const report = createDebugDeviceReport({ featureProvider: this._featureProvider, session: state.session });
    const response = await this.doPost(
      state.reportUrl,
      this.fetchHeaders(state),
      report,
      state.timeoutMs,
    );
    if (!response) return 'retry';
    if (isAuthFailure(response.status)) return 'auth_failed';
    if (response.status < 200 || response.status >= 300) return 'retry';

    try {
      const body = response.json
        ? (await response.json()) as Record<string, unknown> | null
        : null;
      if (body?.ok !== true || typeof body.deviceId !== 'string') return 'retry';
      state.deviceId = body.deviceId;
      this.emitStreamStatus(state, { state: 'connected', deviceId: body.deviceId });
    } catch {
      return 'retry';
    }

    state.lastSentIds.clear();
    for (const feature of this._featureProvider.features) {
      try {
        const snapshot = feature.getSnapshot();
        if (Array.isArray(snapshot)) {
          state.lastSentIds.set(feature.name, snapshotToIds(snapshot));
        }
      } catch {
        // skip
      }
    }
    return 'ok';
  }

  // ---- Private: Delta ----

  private enqueueSendDelta(): void {
    const state = this._stream;
    if (!state || state.sending || state.dirtyFeatures.size === 0) return;
    state.sending = true;

    (async () => {
      let retry = false;
      try {
        const delta: Record<string, unknown[]> = {};
        const nextSentIds = new Map<string, Set<string | number>>();
        const features = this._featureProvider.features;

        for (const featureName of state.dirtyFeatures) {
          const feature = features.find((f) => f.name === featureName);
          if (!feature) continue;
          let snapshot: unknown;
          try { snapshot = feature.getSnapshot(); } catch { continue; }
          if (!Array.isArray(snapshot)) continue;

          const prevIds = state.lastSentIds.get(featureName) || new Set<string | number>();
          const newEntries = snapshot.filter((entry) => {
            const id = getEntryId(entry);
            return id != null && !prevIds.has(id);
          });

          if (newEntries.length > 0) {
            delta[featureName] = newEntries;
            nextSentIds.set(featureName, snapshotToIds(snapshot));
          }
        }

        state.dirtyFeatures.clear();
        state.debounceTimer = null;

        if (Object.keys(delta).length === 0) return;

        if (!state.deviceId) {
          const result = await this.doSendFullReport(state);
          retry = result === 'retry';
          if (result !== 'ok') {
            Object.keys(delta).forEach((n) => state.dirtyFeatures.add(n));
          }
          if (result === 'auth_failed') this.failStreaming(state, 'auth');
          if (result === 'ok') this.resetRetry(state);
          return;
        }

        const response = await this.doPost(
          state.ingestUrl,
          this.fetchHeaders(state),
          { deviceId: state.deviceId, delta: { logs: delta } },
          state.timeoutMs,
        );
        if (!response) {
          Object.keys(delta).forEach((n) => state.dirtyFeatures.add(n));
          retry = true;
          return;
        }

        if (response.status === 404) {
          state.deviceId = null;
          state.lastSentIds.clear();
          const result = await this.doSendFullReport(state);
          retry = result === 'retry';
          if (result !== 'ok') {
            Object.keys(delta).forEach((n) => state.dirtyFeatures.add(n));
          }
          if (result === 'auth_failed') this.failStreaming(state, 'auth');
          if (result === 'ok') this.resetRetry(state);
          return;
        }

        if (isAuthFailure(response.status)) {
          Object.keys(delta).forEach((n) => state.dirtyFeatures.add(n));
          this.failStreaming(state, 'auth');
          return;
        }

        if (response.status < 200 || response.status >= 300) {
          Object.keys(delta).forEach((n) => state.dirtyFeatures.add(n));
          retry = true;
          return;
        }

        nextSentIds.forEach((ids, featureName) => {
          state.lastSentIds.set(featureName, ids);
        });
        this.resetRetry(state);
        if (state.deviceId) {
          this.emitStreamStatus(state, { state: 'connected', deviceId: state.deviceId });
        }
      } finally {
        state.sending = false;
        if (this._stream !== state) return;
        if (retry && state.dirtyFeatures.size > 0) {
          this.scheduleRetry(state);
        } else if (state.dirtyFeatures.size > 0 && !state.debounceTimer) {
          this.scheduleDelta(state);
        }
      }
    })();
  }
}

// ---- Module-level Singleton ----

export const daemonClient = new DaemonClient({ featureProvider: debugToolkit });

// ---- Internal Helpers ----

function buildDaemonUrl(endpoint: string, path: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
}

function isAuthFailure(status: number): boolean {
  return status === 401 || status === 403;
}

function getEntryId(entry: unknown): string | number | null {
  if (!entry || typeof entry !== 'object') return null;
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

async function readHealthBody(
  response: FetchResponseLike,
): Promise<Record<string, unknown> | null> {
  try {
    const body = response.json ? await response.json() : null;
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function readReportResponseBody(
  response: FetchResponseLike,
): Promise<Record<string, unknown>> {
  try {
    if (response.json) {
      const raw = await response.json();
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
      }
    }
  } catch {
    // ignore
  }
  return {};
}

function readLogCount(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [key, count]) => {
      if (typeof count === 'number') acc[key] = count;
      return acc;
    },
    {},
  );
}

export function _resetDaemonClientForTesting(): void {
  daemonClient._resetForTesting();
}

function generateSessionId(): string {
  try {
    return (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.() ?? fallbackSessionId();
  } catch {
    return fallbackSessionId();
  }
}

function fallbackSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
