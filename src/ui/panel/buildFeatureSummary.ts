import type { AnyDebugFeature } from '../../types';
import { Colors } from '../theme/colors';

export interface FeatureSummary {
  capabilityText: string;
  count?: number;
  badCount?: number;
  latestLabel?: string;
  statusLabel?: string;
  statusColor?: string;
  filterMode?: 'all' | 'bad';
  supportsBadFilter: boolean;
}

export function buildFeatureSummary(
  feature: AnyDebugFeature,
  snapshot: unknown,
): FeatureSummary {
  const name = feature.name;

  if (name === 'network') return buildNetworkSummary(snapshot);
  if (name === 'console') return buildConsoleSummary(snapshot);
  if (name === 'navigation') return buildNavigationSummary(snapshot);
  if (name === 'zustand') return buildZustandSummary(snapshot);
  if (name === 'track') return buildTrackSummary(snapshot);
  if (name === 'clipboard') return buildClipboardSummary(snapshot);
  if (name === 'environment') return buildEnvironmentSummary(snapshot);
  if (name === 'devConnect') return buildDevConnectSummary(snapshot);
  if (name === 'sessionHistory') return buildSessionHistorySummary(snapshot);
  if (name === 'thirdPartyLibs') return buildThirdPartyLibsSummary(snapshot);
  if (name === 'native') return buildNativeSummary(snapshot);

  return buildUnknownSummary(snapshot);
}

// ─── Per-feature builders ──────────────────────────────

interface NetworkItem {
  request?: { method?: string; url?: string };
  response?: { status?: number };
  error?: string;
}

function buildNetworkSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  const count = items.length;
  let badCount = 0;
  let latestLabel: string | undefined;

  if (count > 0) {
    for (const item of items) {
      const n = item as NetworkItem;
      if (n.error || (n.response?.status ?? 0) >= 400) badCount++;
    }
    const last = items[items.length - 1] as NetworkItem;
    const method = last.request?.method?.toUpperCase() ?? '';
    const url = last.request?.url ?? '';
    const status = last.response?.status;
    const path = extractPath(url);
    latestLabel = [method, path, status].filter(Boolean).join(' ');
  }

  return {
    capabilityText: 'HTTP capture, status, duration, request and response body',
    count,
    badCount: badCount > 0 ? badCount : undefined,
    latestLabel,
    supportsBadFilter: count > 0,
  };
}

interface ConsoleItem {
  level?: string;
  data?: unknown[];
}

function buildConsoleSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  const count = items.length;
  let badCount = 0;
  let latestLabel: string | undefined;

  if (count > 0) {
    for (const item of items) {
      const lvl = (item as ConsoleItem).level ?? '';
      if (lvl === 'warn' || lvl === 'error' || lvl === 'fatal') badCount++;
    }
    const last = items[items.length - 1] as ConsoleItem;
    latestLabel = formatConsoleMessage(last.data);
  }

  return {
    capabilityText: 'Console log capture with level filtering',
    count,
    badCount: badCount > 0 ? badCount : undefined,
    latestLabel,
    supportsBadFilter: count > 0,
  };
}

interface NavigationItem {
  from?: string;
  to?: string;
}

function buildNavigationSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  const count = items.length;
  let latestLabel: string | undefined;

  if (count > 0) {
    const last = items[items.length - 1] as NavigationItem;
    const from = last.from ?? '?';
    const to = last.to ?? '?';
    latestLabel = `${from} → ${to}`;
  }

  return {
    capabilityText: 'Screen navigation tracking with route history',
    count,
    latestLabel,
    supportsBadFilter: false,
  };
}

interface ZustandItem {
  action?: string;
  storeName?: string;
}

function buildZustandSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  const count = items.length;
  let latestLabel: string | undefined;

  if (count > 0) {
    const last = items[items.length - 1] as ZustandItem;
    const parts = [last.action, last.storeName].filter(Boolean);
    latestLabel = parts.join(' @ ') || undefined;
  }

  return {
    capabilityText: 'State change tracking for Zustand stores',
    count,
    latestLabel,
    supportsBadFilter: false,
  };
}

interface TrackItem {
  eventName?: string;
}

function buildTrackSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  const count = items.length;
  let latestLabel: string | undefined;

  if (count > 0) {
    const last = items[items.length - 1] as TrackItem;
    latestLabel = last.eventName;
  }

  return {
    capabilityText: 'Analytics event tracking and inspection',
    count,
    latestLabel,
    supportsBadFilter: false,
  };
}

function buildClipboardSummary(_snapshot: unknown): FeatureSummary {
  return {
    capabilityText: 'Clipboard event monitoring',
    supportsBadFilter: false,
  };
}

interface EnvironmentSnap {
  environments?: Array<{ id: string; label: string }>;
  currentEnvironmentId?: string | null;
}

function buildEnvironmentSummary(snapshot: unknown): FeatureSummary {
  const env = (snapshot ?? {}) as EnvironmentSnap;
  const envs = env.environments ?? [];
  const current = envs.find((e) => e.id === env.currentEnvironmentId);

  return {
    capabilityText: 'Environment configuration and switching',
    count: envs.length || undefined,
    latestLabel: current?.label,
    statusLabel: current?.label,
    supportsBadFilter: false,
  };
}

interface DevConnectSnap {
  streaming?: boolean;
  computerHost?: string;
  daemonPort?: string;
}

function buildDevConnectSummary(snapshot: unknown): FeatureSummary {
  const s = (snapshot ?? {}) as DevConnectSnap;
  const host = [s.computerHost, s.daemonPort].filter(Boolean).join(':');

  return {
    capabilityText: 'Desktop sync with daemon connection',
    statusLabel: host ? `${s.streaming ? 'live' : 'offline'} ${host}` : s.streaming ? 'live' : undefined,
    statusColor: s.streaming ? Colors.success : undefined,
    supportsBadFilter: false,
  };
}

interface SessionHistorySnap {
  sessions?: unknown[];
  currentSessionId?: string;
  logCounts?: Record<string, unknown>;
}

function buildSessionHistorySummary(snapshot: unknown): FeatureSummary {
  const s = (snapshot ?? {}) as SessionHistorySnap;
  const count = s.sessions?.length;
  return {
    capabilityText: 'Session log recording and replay',
    count: count || undefined,
    latestLabel: s.currentSessionId,
    supportsBadFilter: false,
  };
}

function buildThirdPartyLibsSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  return {
    capabilityText: 'Third-party library inspection and management',
    count: items.length || undefined,
    supportsBadFilter: false,
  };
}

function buildNativeSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  let badCount = 0;
  for (const item of items) {
    const lvl = (item as { level?: string }).level ?? '';
    if (lvl === 'warn' || lvl === 'error' || lvl === 'fatal') badCount++;
  }
  return {
    capabilityText: 'Native log capture',
    count: items.length || undefined,
    badCount: badCount > 0 ? badCount : undefined,
    supportsBadFilter: items.length > 0,
  };
}

function buildUnknownSummary(snapshot: unknown): FeatureSummary {
  const items = asArray(snapshot);
  return {
    capabilityText: `${items.length} item${items.length !== 1 ? 's' : ''} captured`,
    count: items.length || undefined,
    supportsBadFilter: false,
  };
}

// ─── Helpers ───────────────────────────────────────────

function asArray(snap: unknown): unknown[] {
  if (Array.isArray(snap)) return snap;
  return [];
}

function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function formatConsoleMessage(data: unknown[] | undefined): string | undefined {
  if (!data || data.length === 0) return undefined;
  const joined = data
    .map((d) => (typeof d === 'string' ? d : JSON.stringify(d)))
    .join(' ')
    .slice(0, 60);
  return joined || undefined;
}
