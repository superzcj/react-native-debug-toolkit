import type { SessionInfo } from './deviceReport';
import type { StorageAdapter } from './StorageAdapter';

export type LogFeatureKey = 'console_logs' | 'network_logs' | 'track_logs';

export type LogSession = SessionInfo;

export interface SessionIndex {
  currentSessionId: string;
  sessions: LogSession[];
  maxSessions: number;
}

export interface SessionManagerOptions {
  maxSessions?: number;
  featureKeys?: LogFeatureKey[];
}

const SESSION_INDEX_KEY = '@react_native_debug_toolkit/sessions';
const DEFAULT_MAX_SESSIONS = 5;
const DEFAULT_FEATURE_KEYS: LogFeatureKey[] = ['console_logs', 'network_logs', 'track_logs'];

function randomHex(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

function createSession(): LogSession {
  const startedAt = Date.now();
  return {
    id: `${startedAt}-${randomHex()}`,
    startedAt,
  };
}

function isLogSession(value: unknown): value is LogSession {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Partial<LogSession>).id === 'string' &&
    typeof (value as Partial<LogSession>).startedAt === 'number',
  );
}

function parseSessionIndex(raw: string | null): SessionIndex | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionIndex>;
    if (!parsed || !Array.isArray(parsed.sessions)) {
      return null;
    }
    return {
      currentSessionId: typeof parsed.currentSessionId === 'string' ? parsed.currentSessionId : '',
      sessions: parsed.sessions.filter(isLogSession),
      maxSessions: typeof parsed.maxSessions === 'number' ? parsed.maxSessions : DEFAULT_MAX_SESSIONS,
    };
  } catch {
    return null;
  }
}

function compareNewestFirst(left: LogSession, right: LogSession): number {
  return right.startedAt - left.startedAt;
}

export class SessionManager {
  private readonly storage: StorageAdapter;
  private readonly currentSession: LogSession;
  private readonly maxSessions: number;
  private readonly featureKeys: LogFeatureKey[];

  constructor(storage: StorageAdapter, options: SessionManagerOptions = {}) {
    this.storage = storage;
    this.currentSession = createSession();
    this.maxSessions = Math.max(1, Math.floor(options.maxSessions ?? DEFAULT_MAX_SESSIONS));
    this.featureKeys = options.featureKeys?.length ? options.featureKeys : DEFAULT_FEATURE_KEYS;
  }

  async initialize(): Promise<void> {
    const existing = parseSessionIndex(await this.storage.getItem(SESSION_INDEX_KEY));
    const byId = new Map<string, LogSession>();

    byId.set(this.currentSession.id, this.currentSession);
    for (const session of existing?.sessions ?? []) {
      byId.set(session.id, session);
    }

    const sessions = Array.from(byId.values()).sort(compareNewestFirst);
    const retained = sessions.slice(0, this.maxSessions);
    const removed = sessions.slice(this.maxSessions);
    const index: SessionIndex = {
      currentSessionId: this.currentSession.id,
      sessions: retained,
      maxSessions: this.maxSessions,
    };

    await this.storage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
    await this.cleanupSessionLogs(removed);
  }

  getCurrentSession(): LogSession {
    return this.currentSession;
  }

  async getSessionHistory(): Promise<LogSession[]> {
    const index = parseSessionIndex(await this.storage.getItem(SESSION_INDEX_KEY));
    return (index?.sessions ?? []).sort(compareNewestFirst);
  }

  getLogStorageKey(featureKey: LogFeatureKey, sessionId = this.currentSession.id): string {
    return `@react_native_debug_toolkit/${sessionId}/${featureKey}`;
  }

  async loadSessionLogs<T>(sessionId: string, featureKey: LogFeatureKey): Promise<T[]> {
    const raw = await this.storage.getItem(this.getLogStorageKey(featureKey, sessionId));
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }

  async getSessionLogCount(sessionId: string, featureKey: LogFeatureKey): Promise<number> {
    const raw = await this.storage.getItem(this.getLogStorageKey(featureKey, sessionId));
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }

  async clearCurrentSessionLogs(featureKey: LogFeatureKey): Promise<void> {
    await this.storage.setItem(this.getLogStorageKey(featureKey), '[]');
  }

  async cleanupOldSessions(): Promise<number> {
    const index = parseSessionIndex(await this.storage.getItem(SESSION_INDEX_KEY));
    if (!index) {
      return 0;
    }

    const sessions = index.sessions.sort(compareNewestFirst);
    const retained = sessions.slice(0, this.maxSessions);
    const removed = sessions.slice(this.maxSessions);
    if (removed.length === 0) {
      return 0;
    }

    await this.storage.setItem(SESSION_INDEX_KEY, JSON.stringify({
      currentSessionId: index.currentSessionId,
      sessions: retained,
      maxSessions: this.maxSessions,
    }));
    await this.cleanupSessionLogs(removed);
    return removed.length;
  }

  private async cleanupSessionLogs(sessions: LogSession[]): Promise<void> {
    for (const session of sessions) {
      for (const featureKey of this.featureKeys) {
        await this.storage.removeItem(this.getLogStorageKey(featureKey, session.id));
      }
    }
  }
}
