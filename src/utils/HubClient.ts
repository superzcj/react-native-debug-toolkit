import { AppState, type AppStateStatus, Platform } from 'react-native';
import { debugToolkit } from '../core/DebugToolkit';
import type { FeatureDataProvider } from '../types';
import { addToBlacklist } from '../features/network';
import { safeStringify } from './safeStringify';
import { computeHubPayloadHash, normalizeHubValue } from './hubCanonical';
import { getNativeAppInfo } from '../features/devConnect/nativeDevConnect';

// ---- Protocol Constants ----

const PROTOCOL_VERSION = 1;
const CANONICAL_VERSION = 1;
const API_PREFIX = '/api/v1';
const DEFAULT_PORT = 3799;
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const MAX_BATCH_EVENTS = 50;
const MAX_BATCH_BYTES = 512 * 1024;
const MAX_BUFFER_EVENTS = 500;
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const MAX_EVENT_WIRE_BYTES = 60 * 1024;
const FLUSH_INTERVAL_MS = 1000;
const RETRY_BASE_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

const APP_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

// ---- Types ----

export type HubConnectionState =
  | 'connecting'
  | 'connected'
  | 'paused'
  | 'retrying'
  | 'hub_unreachable'
  | 'hub_not_ready'
  | 'storage_full'
  | 'protocol_mismatch'
  | 'invalid_config';

export interface HubConfig {
  appId: string;
  endpoint: string;
}

export interface HubSessionInfo {
  sessionId: string;
  generation: string;
  deviceId: string;
}

export interface HubStatus {
  state: HubConnectionState;
  session: HubSessionInfo | null;
  error?: string;
}

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: unknown;
}) => Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;

type AbortControllerLike = { signal: unknown; abort: () => void };
type AbortControllerCtor = new () => AbortControllerLike;

// ---- Pending Event ----

interface PendingEvent {
  timestamp: number;
  type: string;
  severity: string;
  data: unknown;
  estimatedBytes: number;
}

interface InFlightEvent {
  sequence: number;
  timestamp: number;
  type: string;
  severity: string;
  data: unknown;
  payloadHash: string;
  wireBytes: number;
}

// ---- Severity Helpers ----

const SEVERITIES = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

function normalizeSeverity(value: string): string {
  const lower = value?.toLowerCase?.() || 'info';
  return (SEVERITIES as readonly string[]).includes(lower) ? lower : 'info';
}

function severityPriority(severity: string): number {
  const idx = SEVERITIES.indexOf(severity as typeof SEVERITIES[number]);
  return idx >= 0 ? idx : 1;
}

function normalizeEventTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Date.now();
  }
  const timestamp = Math.trunc(value);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

// ---- Endpoint Validation ----

export function normalizeHubEndpoint(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  let trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^[\d.]+$/.test(trimmed) || /^[a-zA-Z][\w.-]*$/.test(trimmed)) {
      trimmed = `http://${trimmed}:${DEFAULT_PORT}`;
    } else if (/^[\d.]+:\d+$/.test(trimmed) || /^[a-zA-Z][\w.-]*:\d+$/.test(trimmed)) {
      trimmed = `http://${trimmed}`;
    } else {
      return null;
    }
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:') return null;
    if (!url.hostname) return null;
    if (url.username || url.password) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    if (url.search || url.hash) return null;
    const port = url.port || String(DEFAULT_PORT);
    return `http://${url.hostname}:${port}`;
  } catch {
    return null;
  }
}

export function isValidAppId(value: string): boolean {
  return typeof value === 'string' && APP_ID_RE.test(value);
}

// ---- UUID Generation ----

function generateUUIDv4(): string {
  try {
    return (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.() ?? fallbackUUID();
  } catch {
    return fallbackUUID();
  }
}

function fallbackUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ---- HubClient ----

export interface HubClientOptions {
  fetch?: FetchLike;
  AbortController?: AbortControllerCtor;
  featureProvider: FeatureDataProvider;
}

export class HubClient {
  private _config: HubConfig | null = null;
  private _runtimeEndpoint: string | null = null;
  private _sessionId: string | null = null;
  private _session: HubSessionInfo | null = null;
  private _generation: string | null = null;
  private _state: HubConnectionState = 'invalid_config';
  private _syncPaused = false;

  // Send buffer
  private _pending: PendingEvent[] = [];
  private _inFlight: InFlightEvent[] = [];
  private _nextSequence = 1;
  private _ackThrough = 0;
  private _pendingBytes = 0;
  private _inFlightBytes = 0;
  private _overflowCount = 0;
  private _overflowByType: Record<string, number> = {};

  // Timers
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryAttempt = 0;
  private _openSessionPromise: Promise<void> | null = null;

  // Flags
  private _sending = false;
  private _active = false;
  private _appStateSubscription: (() => void) | null = null;

  // Feature tracking
  private _featureProvider: FeatureDataProvider;
  private _featureUnsubscribes: Array<() => void> = [];
  private _lastFeatureIds: Map<string, Set<string | number>> = new Map();
  private _dirtyFeatures: Set<string> = new Set();

  // Listeners
  private _onStatusChange?: (status: HubStatus) => void;
  private _fetch: FetchLike | undefined;
  private _AbortController: AbortControllerCtor | undefined;

  constructor(options: HubClientOptions) {
    this._featureProvider = options.featureProvider;
    this._fetch = options.fetch;
    this._AbortController = options.AbortController;
  }

  // ---- Configuration ----

  configure(config: HubConfig): void {
    const endpoint = normalizeHubEndpoint(config.endpoint);
    if (!endpoint || !isValidAppId(config.appId)) {
      this._state = 'invalid_config';
      this._emitStatus();
      return;
    }
    this._config = { appId: config.appId, endpoint };
    addToBlacklist(endpoint);
    this._runtimeEndpoint = null;
    this._syncPaused = !isDevRuntime();
    this._state = this._syncPaused ? 'paused' : 'connecting';
    this._emitStatus();
  }

  setRuntimeEndpoint(value: string): void {
    const normalized = normalizeHubEndpoint(value);
    if (!normalized) return;

    const oldEndpoint = this.getEffectiveEndpoint();
    this._runtimeEndpoint = normalized;
    addToBlacklist(normalized);

    if (oldEndpoint && oldEndpoint !== normalized && this._active) {
      // Endpoint changed: flush old, create new session
      this._flushAndSwitchEndpoint();
    }
  }

  clearRuntimeEndpoint(): void {
    const oldEndpoint = this.getEffectiveEndpoint();
    this._runtimeEndpoint = null;
    const newEndpoint = this.getEffectiveEndpoint();

    if (oldEndpoint && oldEndpoint !== newEndpoint && this._active) {
      this._flushAndSwitchEndpoint();
    }
  }

  getEffectiveEndpoint(): string | null {
    return this._runtimeEndpoint || this._config?.endpoint || null;
  }

  setOnStatusChange(fn: ((status: HubStatus) => void) | undefined): void {
    this._onStatusChange = fn;
  }

  // ---- Connection ----

  connect(options?: { live?: boolean }): void {
    if (this._active) return;

    const endpoint = this.getEffectiveEndpoint();
    const appId = this._config?.appId;
    if (!endpoint || !appId) {
      this._state = 'invalid_config';
      this._emitStatus();
      return;
    }

    const live = options?.live ?? isDevRuntime();
    this._syncPaused = !live;

    this._active = true;
    this._sessionId = generateUUIDv4();
    this._nextSequence = 1;
    this._ackThrough = 0;
    this._pending = [];
    this._inFlight = [];
    this._pendingBytes = 0;
    this._inFlightBytes = 0;
    this._overflowCount = 0;
    this._overflowByType = {};
    this._retryAttempt = 0;

    // Subscribe to features
    for (const feature of this._featureProvider.features) {
      if (!feature.subscribe) continue;
      const unsub = feature.subscribe(() => this._onFeatureChange(feature.name));
      this._featureUnsubscribes.push(unsub);
    }

    // App state
    this._appStateSubscription = AppState.addEventListener(
      'change',
      (state) => this._handleAppState(state),
    ).remove;

    this._state = 'connecting';
    this._emitStatus();
    this._openSession();
  }

  disconnect(): void {
    if (!this._active) return;
    this._active = false;
    this._clearTimers();
    this._featureUnsubscribes.forEach(fn => fn());
    this._featureUnsubscribes = [];
    this._appStateSubscription?.();
    this._appStateSubscription = null;
    this._session = null;
    this._generation = null;
    this._sessionId = null;
    this._pending = [];
    this._inFlight = [];
    this._pendingBytes = 0;
    this._inFlightBytes = 0;
    this._state = 'invalid_config';
    this._emitStatus();
  }

  isActive(): boolean { return this._active; }

  getStatus(): HubStatus {
    return {
      state: this._state,
      session: this._session,
    };
  }

  // ---- Sync Controls ----

  pauseSync(): void {
    this._syncPaused = true;
    this._state = 'paused';
    this._emitStatus();
  }

  resumeSync(): void {
    if (!this._active) {
      this.connect({ live: true });
      return;
    }
    this._syncPaused = false;
    if (this._session) {
      this._state = 'connected';
      this._scheduleFlush();
    }
    this._emitStatus();
  }

  isSyncPaused(): boolean { return this._syncPaused; }

  async syncNow(): Promise<void> {
    const pauseAfterSync = !isDevRuntime() || this._syncPaused;
    if (!this._active) {
      this.connect({ live: true });
    } else {
      this._syncPaused = false;
    }
    await this._ensureSession();
    this._snapshotFeatures();
    await this._doFlush();
    if (pauseAfterSync && this._state === 'connected') {
      this.pauseSync();
    }
  }

  private async _ensureSession(): Promise<void> {
    if (this._openSessionPromise) {
      await this._openSessionPromise;
      return;
    }
    if (!this._session) {
      await this._openSession();
    }
  }

  // ---- Private: Session ----

  private _openSession(): Promise<void> {
    if (this._openSessionPromise) return this._openSessionPromise;

    const opening = this._openSessionInternal();
    this._openSessionPromise = opening;
    const clearOpening = () => {
      if (this._openSessionPromise === opening) {
        this._openSessionPromise = null;
      }
    };
    opening.then(clearOpening, clearOpening);
    return opening;
  }

  private async _openSessionInternal(): Promise<void> {
    const endpoint = this.getEffectiveEndpoint();
    const appId = this._config?.appId;
    if (!endpoint || !appId || !this._sessionId) return;

    const device = await this._getDeviceInfo();
    const body = {
      protocolVersion: PROTOCOL_VERSION,
      canonicalVersion: CANONICAL_VERSION,
      sessionId: this._sessionId,
      startedAt: Date.now(),
      clientAckThrough: this._ackThrough,
      device,
    };

    try {
      const response = await this._post(
        `${endpoint}${API_PREFIX}/apps/${encodeURIComponent(appId)}/sessions`,
        body,
      );

      if (!response) {
        this._state = 'hub_unreachable';
        this._emitStatus();
        this._scheduleRetry();
        return;
      }

      if (response.status === 426) {
        this._state = 'protocol_mismatch';
        this._emitStatus();
        return;
      }

      if (response.status === 507) {
        this._state = 'storage_full';
        this._emitStatus();
        this._scheduleRetry();
        return;
      }

      if (response.status === 503) {
        this._state = 'hub_not_ready';
        this._emitStatus();
        this._scheduleRetry();
        return;
      }

      if (!response.ok) {
        this._state = 'hub_unreachable';
        this._emitStatus();
        this._scheduleRetry();
        return;
      }

      const data = await response.json?.() as Record<string, unknown> | undefined;
      if (!data?.ok) {
        this._state = 'hub_unreachable';
        this._emitStatus();
        this._scheduleRetry();
        return;
      }

      this._session = {
        sessionId: data.sessionId as string,
        generation: data.generation as string,
        deviceId: data.deviceId as string,
      };
      this._generation = data.generation as string;
      this._nextSequence = (data.expectedSequence as number) || 1;
      this._ackThrough = (data.ackThrough as number) || this._ackThrough;
      this._retryAttempt = 0;

      this._state = this._syncPaused ? 'paused' : 'connected';
      this._emitStatus();

      this._startHeartbeat();
      if (!this._syncPaused) {
        this._snapshotFeatures();
        this._scheduleFlush();
      }
    } catch {
      this._state = 'hub_unreachable';
      this._emitStatus();
      this._scheduleRetry();
    }
  }

  // ---- Private: Events & Buffer ----

  private _enqueueEvent(event: Omit<PendingEvent, 'estimatedBytes'>): void {
    const serialized = safeStringify({ ...event, sequence: 0, payloadHash: '0'.repeat(64) });
    const estimatedBytes = typeof serialized === 'string' ? serialized.length : 200;

    if (estimatedBytes > MAX_EVENT_WIRE_BYTES) {
      this._overflowCount++;
      this._overflowByType[event.type] = (this._overflowByType[event.type] || 0) + 1;
      return;
    }

    const totalEvents = this._pending.length + this._inFlight.length;
    const totalBytes = this._pendingBytes + this._inFlightBytes;

    if (totalEvents >= MAX_BUFFER_EVENTS || totalBytes + estimatedBytes > MAX_BUFFER_BYTES) {
      this._evictPending();
      if (this._pending.length + this._inFlight.length >= MAX_BUFFER_EVENTS ||
          this._pendingBytes + this._inFlightBytes + estimatedBytes > MAX_BUFFER_BYTES) {
        this._overflowCount++;
        this._overflowByType[event.type] = (this._overflowByType[event.type] || 0) + 1;
        return;
      }
    }

    this._pending.push({ ...event, estimatedBytes });
    this._pendingBytes += estimatedBytes;

    if (!this._syncPaused && this._session) {
      this._scheduleFlush();
    }
  }

  private _evictPending(): void {
    // Evict lowest priority pending events (debug/info, successful network)
    const sorted = [...this._pending].sort((a, b) => {
      const pa = severityPriority(a.severity);
      const pb = severityPriority(b.severity);
      if (pa !== pb) return pa - pb;
      return a.timestamp - b.timestamp;
    });

    while (sorted.length > 0 &&
           (sorted.length + this._inFlight.length > MAX_BUFFER_EVENTS * 0.8 ||
            this._pendingBytes + this._inFlightBytes > MAX_BUFFER_BYTES * 0.8)) {
      const evicted = sorted.shift()!;
      const idx = this._pending.indexOf(evicted);
      if (idx >= 0) {
        this._pending.splice(idx, 1);
        this._pendingBytes -= evicted.estimatedBytes;
        this._overflowCount++;
        this._overflowByType[evicted.type] = (this._overflowByType[evicted.type] || 0) + 1;
      }
    }
  }

  private _onFeatureChange(featureName: string): void {
    this._dirtyFeatures.add(featureName);
    if (!this._syncPaused && this._session && !this._flushTimer) {
      this._scheduleFlush();
    }
  }

  private _snapshotFeatures(): void {
    for (const feature of this._featureProvider.features) {
      if (!feature.getSnapshot) continue;
      try {
        const snapshot = feature.getSnapshot();
        if (!Array.isArray(snapshot)) continue;

        const prevIds = this._lastFeatureIds.get(feature.name) || new Set<string | number>();
        const newEntries = snapshot.filter((entry: unknown) => {
          if (!entry || typeof entry !== 'object') return false;
          const id = (entry as Record<string, unknown>).id;
          if (typeof id !== 'string' && typeof id !== 'number') return false;
          return !prevIds.has(id);
        });

        for (const entry of newEntries) {
          const e = entry as Record<string, unknown>;
          this._enqueueEvent({
            timestamp: normalizeEventTimestamp(e.timestamp),
            type: feature.name,
            severity: normalizeSeverity(String(e.level || e.severity || 'info')),
            data: e,
          });
        }

        const allIds = new Set<string | number>();
        for (const entry of snapshot) {
          if (entry && typeof entry === 'object') {
            const id = (entry as Record<string, unknown>).id;
            if (typeof id === 'string' || typeof id === 'number') allIds.add(id);
          }
        }
        this._lastFeatureIds.set(feature.name, allIds);
      } catch { /* skip */ }
    }
    this._dirtyFeatures.clear();
  }

  // ---- Private: Flush ----

  private _scheduleFlush(): void {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._doFlush();
    }, FLUSH_INTERVAL_MS);
  }

  private async _doFlush(): Promise<void> {
    if (this._sending || !this._active || !this._session) return;
    if (this._syncPaused) return;

    // Snapshot dirty features first
    if (this._dirtyFeatures.size > 0) {
      this._snapshotFeatures();
    }

    if (this._pending.length === 0 && this._inFlight.length === 0) return;

    this._sending = true;
    try {
      const batch: InFlightEvent[] = [];
      let batchBytes = 0;
      // A failed/unknown request must be sent again before assigning new
      // sequence numbers. Otherwise the server observes an irreparable gap.
      const source = this._inFlight.length > 0 ? this._inFlight : null;
      if (source) {
        for (const event of source) {
          if (batch.length >= MAX_BATCH_EVENTS || batchBytes + event.wireBytes > MAX_BATCH_BYTES) break;
          batch.push(event);
          batchBytes += event.wireBytes;
        }
      } else {
        while (this._pending.length > 0 && batch.length < MAX_BATCH_EVENTS) {
          const pending = this._pending[0]!;
          const severity = normalizeSeverity(pending.severity);
          // Hash exactly the JSON-compatible value that will cross the wire.
          // Native Blob and other host objects can expose a different toJSON()
          // representation than their enumerable in-memory shape.
          const data = normalizeHubValue(pending.data);
          const event: InFlightEvent = {
            sequence: this._nextSequence,
            timestamp: pending.timestamp,
            type: pending.type,
            severity,
            data,
            payloadHash: computeHubPayloadHash({
              sessionId: this._sessionId!,
              sequence: this._nextSequence,
              timestamp: pending.timestamp,
              type: pending.type,
              severity,
              data,
            }),
            wireBytes: pending.estimatedBytes,
          };

          if (batchBytes + event.wireBytes > MAX_BATCH_BYTES) break;

          this._pending.shift();
          this._pendingBytes -= pending.estimatedBytes;
          this._inFlight.push(event);
          this._inFlightBytes += event.wireBytes;
          batch.push(event);
          batchBytes += event.wireBytes;
          this._nextSequence++;
        }
      }

      if (batch.length === 0) {
        this._sending = false;
        return;
      }

      const endpoint = this.getEffectiveEndpoint()!;
      const appId = this._config!.appId;

      const wireEvents = batch.map(e => ({
        sequence: e.sequence,
        timestamp: e.timestamp,
        type: e.type,
        severity: e.severity,
        data: e.data,
        payloadHash: e.payloadHash,
      }));

      const response = await this._post(
        `${endpoint}${API_PREFIX}/apps/${encodeURIComponent(appId)}/sessions/${encodeURIComponent(this._sessionId!)}/events`,
        {
          generation: this._generation,
          firstSequence: batch[0]!.sequence,
          events: wireEvents,
        },
      );

      if (!response || !response.ok) {
        const status = response?.status;
        if (status === 409) {
          // May need to re-open session
          await this._openSession();
        } else if (status === 507) {
          this._state = 'storage_full';
          this._emitStatus();
        }
        this._scheduleRetry();
        this._sending = false;
        return;
      }

      const data = await response.json?.() as Record<string, unknown> | undefined;
      if (data?.ok) {
        const ackThrough = data.ackThrough as number;
        this._ackThrough = Math.max(this._ackThrough, ackThrough);
        // Remove ACKed events from in-flight
        this._inFlight = this._inFlight.filter(e => e.sequence > ackThrough);
        this._inFlightBytes = this._inFlight.reduce((sum, e) => sum + e.wireBytes, 0);
        this._retryAttempt = 0;

        if (this._state !== 'paused') {
          this._state = 'connected';
          this._emitStatus();
        }
      }
    } catch {
      this._scheduleRetry();
    } finally {
      this._sending = false;
      if ((this._pending.length > 0 || this._inFlight.length > 0) &&
          !this._syncPaused && !this._retryTimer) {
        this._scheduleFlush();
      }
    }
  }

  // ---- Private: Heartbeat ----

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    const jitter = Math.random() * 2000;
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), HEARTBEAT_INTERVAL_MS + jitter);
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  private async _sendHeartbeat(): Promise<void> {
    if (!this._active || !this._session) return;

    const endpoint = this.getEffectiveEndpoint();
    const appId = this._config?.appId;
    if (!endpoint || !appId || !this._sessionId) return;

    try {
      const response = await this._post(
        `${endpoint}${API_PREFIX}/apps/${encodeURIComponent(appId)}/sessions/${encodeURIComponent(this._sessionId)}/heartbeat`,
        {
          generation: this._generation,
          syncState: this._syncPaused ? 'paused' : 'live',
          clientTime: Date.now(),
          clientAckThrough: this._ackThrough,
        },
      );

      if (response?.status === 409) {
        // Stale generation - re-open
        await this._openSession();
      }
    } catch {
      // Heartbeat failure is non-fatal
    }
  }

  // ---- Private: Retry ----

  private _scheduleRetry(): void {
    if (this._retryTimer) return;
    const delay = Math.min(RETRY_BASE_MS * (2 ** this._retryAttempt), MAX_RETRY_DELAY_MS);
    const jitter = Math.random() * delay * 0.2;
    this._retryAttempt++;

    if (this._state !== 'paused' && this._state !== 'protocol_mismatch' && this._state !== 'storage_full') {
      this._state = 'retrying';
      this._emitStatus();
    }

    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (!this._active) return;
      if (!this._session) {
        this._openSession();
      } else {
        this._doFlush();
      }
    }, delay + jitter);
  }

  // ---- Private: Endpoint Switch ----

  private _flushAndSwitchEndpoint(): void {
    // Try to flush to old hub
    this._doFlush().catch(() => {});

    // Discard in-flight for old hub
    this._inFlight = [];
    this._inFlightBytes = 0;

    // New session for new hub
    this._session = null;
    this._generation = null;
    this._sessionId = generateUUIDv4();
    this._nextSequence = 1;
    this._ackThrough = 0;
    this._retryAttempt = 0;

    this._state = 'connecting';
    this._emitStatus();
    this._openSession();
  }

  // ---- Private: App State ----

  private _handleAppState(nextState: AppStateStatus): void {
    if (!this._active) return;
    if (nextState === 'background') {
      this._doFlush().catch(() => {});
      this._stopHeartbeat();
    } else if (nextState === 'active') {
      this._sendHeartbeat();
      this._startHeartbeat();
      if (!this._syncPaused) {
        this._snapshotFeatures();
        this._scheduleFlush();
      }
    }
  }

  // ---- Private: HTTP ----

  private async _post(url: string, body: unknown): Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> } | null> {
    const fetchImpl = this._fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!fetchImpl) return null;

    const GlobalAbortController = (globalThis as unknown as {
      AbortController?: AbortControllerCtor;
    }).AbortController;
    const controller = this._AbortController
      ? new this._AbortController()
      : GlobalAbortController
        ? new GlobalAbortController()
        : undefined;

    const timeout = controller
      ? setTimeout(() => controller.abort(), 10000)
      : undefined;

    try {
      return await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // React Native on iOS may otherwise replay a cached POST response
          // after a Hub restart, including an obsolete generation token.
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
        body: safeStringify(body) || '{}',
        signal: controller?.signal,
      });
    } catch {
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // ---- Private: Device Info ----

  private async _getDeviceInfo(): Promise<Record<string, string>> {
    const fallback = {
      platform: Platform.OS,
      osVersion: String(Platform.Version || ''),
      manufacturer: '',
      model: '',
      appVersion: '',
      buildNumber: '',
      nativeApplicationId: '',
    };
    const native = await getNativeAppInfo();
    if (!native) return fallback;
    return {
      ...fallback,
      ...Object.fromEntries(
        Object.entries(native).filter(([, value]) => typeof value === 'string'),
      ),
    };
  }

  // ---- Private: Emit ----

  private _emitStatus(): void {
    try { this._onStatusChange?.(this.getStatus()); } catch { /* ignore */ }
  }

  // ---- Private: Cleanup ----

  private _clearTimers(): void {
    if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
  }

  // ---- Test Helpers ----

  _resetForTesting(): void {
    this.disconnect();
    this._config = null;
    this._runtimeEndpoint = null;
  }
}

// ---- Module Singleton ----

export const hubClient = new HubClient({ featureProvider: debugToolkit });

export function _resetHubClientForTesting(): void {
  hubClient._resetForTesting();
}
