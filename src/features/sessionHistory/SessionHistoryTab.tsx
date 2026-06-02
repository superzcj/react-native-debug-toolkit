import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Colors, getMethodColor } from '../../ui/theme/colors';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { JsonView } from '../../ui/shared/JsonView';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import { safeStringify } from '../../utils/safeStringify';
import { fmt } from '../../utils/copyToComputer';
import { LEVEL_COLORS, LEVEL_ICONS } from '../../constants/logLevels';
import type { DebugFeature, DebugFeatureRenderProps, LogFeatureKey, LogSession } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────

export type LogCounts = Record<LogFeatureKey, number>;

export interface SessionHistoryState {
  sessions: LogSession[];
  currentSessionId: string;
  loading: boolean;
  selectedSession: SelectedSession | null;
  storageType: string;
  logCounts: Record<string, LogCounts>;
}

export interface SessionHistoryFeature extends DebugFeature<SessionHistoryState> {
  loadSession: (sessionId: string | null) => void;
}

export interface SelectedSession {
  sessionId: string;
  logs: Record<LogFeatureKey, unknown[]>;
}

interface FlatLogEntry {
  id: string;
  type: LogFeatureKey;
  timestamp: number;
  raw: unknown;
}

// ── Constants ──────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<LogFeatureKey, string> = {
  console_logs: 'Console',
  network_logs: 'Network',
  track_logs: 'Track',
};

const FEATURE_COLORS: Record<LogFeatureKey, string> = {
  console_logs: Colors.info,
  network_logs: Colors.success,
  track_logs: Colors.purple,
};

const FEATURE_KEYS: LogFeatureKey[] = Object.keys(FEATURE_LABELS) as LogFeatureKey[];

// ── Helpers ────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (isToday) return `Today ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time;
}

function totalCounts(counts: LogCounts): number {
  return (counts.console_logs ?? 0) + (counts.network_logs ?? 0) + (counts.track_logs ?? 0);
}

function totalLogs(logs: Record<LogFeatureKey, unknown[]>): number {
  return Object.values(logs).reduce((sum, arr) => sum + arr.length, 0);
}

function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

function flattenLogs(logs: Record<LogFeatureKey, unknown[]>, filter: DetailFilter): FlatLogEntry[] {
  const keys: LogFeatureKey[] = filter === 'all'
    ? ['console_logs', 'network_logs', 'track_logs']
    : [filter];
  const entries: FlatLogEntry[] = [];
  for (const key of keys) {
    const items = logs[key] ?? [];
    items.forEach((raw, i) => {
      const e = raw as Record<string, any>;
      entries.push({
        id: `${key}-${i}`,
        type: key,
        timestamp: e.timestamp ?? 0,
        raw,
      });
    });
  }
  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries;
}

function toRecord(entry: FlatLogEntry): Record<string, any> {
  return entry.raw as Record<string, any>;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

// ── Main Tab ───────────────────────────────────────────────────────────

export const SessionHistoryTab: React.FC<DebugFeatureRenderProps<SessionHistoryState>> = React.memo(
  ({ snapshot, feature }) => {
    const { sessions, currentSessionId, loading, selectedSession, logCounts } = snapshot;

    const handleSelectSession = useCallback(
      (session: LogSession) => {
        if (session.id === currentSessionId) return;
        (feature as SessionHistoryFeature).loadSession(session.id);
      },
      [feature, currentSessionId],
    );

    const handleBack = useCallback(() => {
      (feature as SessionHistoryFeature).loadSession(null);
    }, [feature]);

    if (loading) {
      return (
        <View style={s.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }

    if (selectedSession) {
      return (
        <SessionDetail
          logs={selectedSession.logs}
          sessionId={selectedSession.sessionId}
          onBack={handleBack}
        />
      );
    }

    const previousSessions = sessions.filter((s) => s.id !== currentSessionId);
    const currentSession = sessions.find((s) => s.id === currentSessionId);

    if (previousSessions.length === 0) {
      return (
        <View style={s.center}>
          <View style={s.emptyClock}>
            <Text style={s.emptyClockText}>⏱</Text>
          </View>
          <Text style={s.emptyTitle}>No session history</Text>
          <Text style={s.emptySub}>
            Previous sessions will appear here after you restart the app.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={s.container} contentContainerStyle={s.scrollContent}>
        {currentSession && (
          <View style={s.currentCard}>
            <View style={s.currentRow}>
              <View style={s.pulseDot} />
              <Text style={s.currentLabel}>CURRENT</Text>
            </View>
            <Text style={s.currentTime}>{formatFullDate(currentSession.startedAt)}</Text>
          </View>
        )}

        <View style={s.timelineSection}>
          <Text style={s.timelineHeader}>PREVIOUS SESSIONS</Text>
          {previousSessions.map((session, idx) => {
            const counts = logCounts[session.id];
            const total = counts ? totalCounts(counts) : 0;
            return (
              <Pressable
                key={session.id}
                style={s.timelineRow}
                onPress={() => handleSelectSession(session)}
                android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
              >
                <View style={s.railCol}>
                  <View style={s.railDot} />
                  {idx < previousSessions.length - 1 && <View style={s.railLine} />}
                </View>

                <View style={s.historyCard}>
                  <View style={s.cardTop}>
                    <Text style={s.cardTime}>{formatTime(session.startedAt)}</Text>
                    <Text style={s.cardRelative}>{relativeTime(session.startedAt)}</Text>
                  </View>

                  {counts && total > 0 ? (
                    <View style={s.pillRow}>
                      {FEATURE_KEYS.map((key) => {
                        const c = counts[key] ?? 0;
                        if (c === 0) return null;
                        return (
                          <View key={key} style={[s.pill, { backgroundColor: FEATURE_COLORS[key] + '18' }]}>
                            <View style={[s.pillDot, { backgroundColor: FEATURE_COLORS[key] }]} />
                            <Text style={[s.pillText, { color: FEATURE_COLORS[key] }]}>
                              {c} {FEATURE_LABELS[key]}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={s.cardEmpty}>No logs recorded</Text>
                  )}

                  <View style={s.cardFooter}>
                    <Text style={s.cardId}>#{shortId(session.id)}</Text>
                    <Text style={s.cardChevron}>›</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  },
);

// ── Session Detail (uses LogListScreen for tap-to-detail) ──────────────

type DetailFilter = 'all' | LogFeatureKey;

const SessionDetail: React.FC<{
  logs: Record<LogFeatureKey, unknown[]>;
  sessionId: string;
  onBack: () => void;
}> = React.memo(({ logs, sessionId, onBack }) => {
  const [filter, setFilter] = useState<DetailFilter>('all');
  const total = totalLogs(logs);

  const flatEntries = useMemo(() => flattenLogs(logs, filter), [logs, filter]);

  return (
    <View style={s.container}>
      <View style={s.sessionHeader}>
        <Pressable onPress={onBack} hitSlop={12} style={s.headerBackBtn}>
          <Text style={s.headerArrow}>‹</Text>
          <Text style={s.headerBackLabel}>Sessions</Text>
        </Pressable>
        <Text style={s.headerMeta}>#{shortId(sessionId)}</Text>
      </View>

      <LogListScreen
        data={flatEntries}
        reversed={false}
        emptyText={filter === 'all' ? 'No logs in this session' : `No ${FEATURE_LABELS[filter]} logs`}
        renderListHeader={() => (
          <View style={s.filterBar}>
            <FilterChip label="All" count={total} active={filter === 'all'} onPress={() => setFilter('all')} color={Colors.text} />
            {FEATURE_KEYS.map((key) => {
              const c = (logs[key] ?? []).length;
              return (
                <FilterChip
                  key={key}
                  label={FEATURE_LABELS[key]}
                  count={c}
                  active={filter === key}
                  onPress={() => setFilter(key)}
                  color={FEATURE_COLORS[key]}
                />
              );
            })}
          </View>
        )}
        renderRow={(item) => <LogRow entry={item} />}
        renderDetailHeader={(item) => <LogDetailHeader entry={item} />}
        renderDetailBody={(item) => <LogDetailBody entry={item} />}
      />
    </View>
  );
});

// ── Filter Chips ───────────────────────────────────────────────────────

const FilterChip: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  color: string;
}> = React.memo(({ label, count, active, onPress, color }) => (
  <Pressable
    onPress={onPress}
    style={[s.chip, active && { backgroundColor: color }]}
    hitSlop={4}
  >
    <Text style={[s.chipLabel, active && s.chipLabelActive]}>
      {label} <Text style={[s.chipCount, active && s.chipCountActive]}>{count}</Text>
    </Text>
  </Pressable>
));

// ── Log List Row ───────────────────────────────────────────────────────

const LogRow: React.FC<{ entry: FlatLogEntry }> = React.memo(({ entry }) => {
  const e = toRecord(entry);

  if (entry.type === 'console_logs') {
    const level = e.level ?? 'log';
    const msg = Array.isArray(e.data)
      ? e.data.map((d: any) => (typeof d === 'string' ? d : safeStringify(d))).join(' ')
      : safeStringify(e.data);
    return (
      <View style={s.rowContent}>
        <View style={[s.levelDot, { backgroundColor: LEVEL_COLORS[level] ?? '#8E8E93' }]}>
          <Text style={s.levelIcon}>{LEVEL_ICONS[level] ?? '●'}</Text>
        </View>
        <View style={s.rowBody}>
          <Text style={s.rowMsg} numberOfLines={2}>{msg}</Text>
          <Text style={s.rowTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
        </View>
      </View>
    );
  }

  if (entry.type === 'network_logs') {
    const method = e.request?.method ?? '?';
    const url = e.request?.url ?? '';
    const status = e.response?.status;
    const ok = !e.error && (!status || status < 400);
    return (
      <View style={s.rowContent}>
        <View style={[s.statusBar, { backgroundColor: ok ? Colors.success : Colors.error }]} />
        <View style={s.rowBody}>
          <View style={s.rowMeta}>
            <Text style={[s.methodText, { color: getMethodColor(method) }]}>{method}</Text>
            {status != null && (
              <View style={[s.miniPill, { backgroundColor: ok ? Colors.success : Colors.error }]}>
                <Text style={s.miniPillText}>{status}</Text>
              </View>
            )}
          </View>
          <Text style={[s.rowMsg, !ok && { color: Colors.error }]} numberOfLines={1}>{shortenUrl(url)}</Text>
          <Text style={s.rowTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
        </View>
      </View>
    );
  }

  // track_logs
  const name = e.eventName ?? e.action ?? 'Event';
  return (
    <View style={s.rowContent}>
      <View style={s.trackDot} />
      <View style={s.rowBody}>
        <Text style={s.rowMsg} numberOfLines={1}>{name}</Text>
        <Text style={s.rowTime}>{e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''}</Text>
      </View>
    </View>
  );
});

// ── Log Detail Header ──────────────────────────────────────────────────

const LogDetailHeader: React.FC<{ entry: FlatLogEntry }> = React.memo(({ entry }) => {
  const e = toRecord(entry);

  if (entry.type === 'console_logs') {
    const level = e.level ?? 'log';
    return (
      <>
        <View style={[s.levelBadge, { backgroundColor: LEVEL_COLORS[level] ?? '#8E8E93' }]}>
          <Text style={s.levelBadgeText}>{level.toUpperCase()}</Text>
        </View>
        <Text style={s.detailTimestamp}>{new Date(e.timestamp).toLocaleString()}</Text>
      </>
    );
  }

  if (entry.type === 'network_logs') {
    const method = e.request?.method ?? '?';
    const status = e.response?.status;
    const ok = !e.error && (!status || status < 400);
    return (
      <View style={s.networkHeaderBadges}>
        <View style={[s.methodBadge, { backgroundColor: getMethodColor(method) }]}>
          <Text style={s.methodBadgeText}>{method}</Text>
        </View>
        {status != null && (
          <View style={[s.statusPill, { backgroundColor: ok ? Colors.success : Colors.error }]}>
            <Text style={s.statusPillText}>{status}</Text>
          </View>
        )}
        {e.duration != null && <Text style={s.durationText}>{e.duration}ms</Text>}
      </View>
    );
  }

  return (
    <Text style={s.detailTimestamp}>
      {new Date(e.timestamp).toLocaleString()}
    </Text>
  );
});

// ── Log Detail Body ────────────────────────────────────────────────────

const LogDetailBody: React.FC<{ entry: FlatLogEntry }> = React.memo(({ entry }) => {
  const e = toRecord(entry);

  if (entry.type === 'console_logs') {
    const data = Array.isArray(e.data) ? e.data : [e.data];
    return (
      <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
        {data.map((d: any, i: number) => {
          const formatted = typeof d === 'object' && d !== null ? fmt(d) : String(d);
          return (
            <CollapsibleSection
              key={i}
              title={typeof d === 'object' && d !== null ? `Arg ${i + 1} (object)` : `Arg ${i + 1}`}
              initiallyExpanded={i === 0}
            >
              <View style={s.sectionWithCopy}>
                <CopyButton text={formatted} label={`Arg ${i + 1}`} />
                {typeof d === 'object' && d !== null ? (
                  <JsonView data={d} maxHeight={250} />
                ) : (
                  <Text style={s.plainText} selectable>{String(d)}</Text>
                )}
              </View>
            </CollapsibleSection>
          );
        })}
      </ScrollView>
    );
  }

  if (entry.type === 'network_logs') {
    return (
      <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
        {/* URL */}
        <View style={s.urlCard}>
          <Text style={s.urlText} selectable numberOfLines={3}>{e.request?.url}</Text>
          <CopyButton text={e.request?.url ?? ''} label="URL" />
        </View>

        {/* Error */}
        {e.error && (
          <View style={s.errorBox}>
            <Text style={s.errorIcon}>⚠</Text>
            <Text style={s.errorText}>{e.error}</Text>
          </View>
        )}

        {/* Request Body */}
        <CollapsibleSection title="Request Body" initiallyExpanded>
          {e.request?.body != null ? (
            <View style={s.sectionWithCopy}>
              <CopyButton text={fmt(e.request.body)} label="Request Body" />
              <JsonView data={e.request.body} maxHeight={250} />
            </View>
          ) : (
            <Text style={s.emptySection}>No request body</Text>
          )}
        </CollapsibleSection>

        {/* Request Headers */}
        {e.request?.headers && (
          <CollapsibleSection title="Request Headers">
            <View style={s.sectionWithCopy}>
              <CopyButton text={fmt(e.request.headers)} label="Request Headers" />
              <JsonView data={e.request.headers} maxHeight={200} />
            </View>
          </CollapsibleSection>
        )}

        {/* Response Body */}
        <CollapsibleSection title="Response Body" initiallyExpanded>
          {e.response?.data != null ? (
            <View style={s.sectionWithCopy}>
              <CopyButton text={fmt(e.response.data)} label="Response Body" />
              <JsonView data={e.response.data} maxHeight={300} />
            </View>
          ) : (
            <Text style={s.emptySection}>No response body</Text>
          )}
        </CollapsibleSection>

        {/* Response Headers */}
        {e.response?.headers && (
          <CollapsibleSection title="Response Headers">
            <View style={s.sectionWithCopy}>
              <CopyButton text={fmt(e.response.headers)} label="Response Headers" />
              <JsonView data={e.response.headers} maxHeight={200} />
            </View>
          </CollapsibleSection>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
      <View style={s.sectionWithCopy}>
        <CopyButton text={fmt(entry.raw)} label="Event" />
        <JsonView data={entry.raw} maxHeight={400} />
      </View>
    </ScrollView>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingTop: 12, paddingBottom: 60 },

  // Center (loading / empty)
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: 32 },
  emptyClock: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 16,
  },
  emptyClockText: { fontSize: 28 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  emptySub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Current session
  currentCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  currentRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CD964', marginRight: 8 },
  currentLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.8 },
  currentTime: { fontSize: 15, color: '#FFFFFF', fontWeight: '500' },

  // Timeline
  timelineSection: { paddingHorizontal: 16 },
  timelineHeader: { fontSize: 11, fontWeight: '700', color: Colors.textLight, letterSpacing: 0.8, marginBottom: 12 },
  timelineRow: { flexDirection: 'row' },

  railCol: { width: 24, alignItems: 'center', paddingTop: 14 },
  railDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.surface,
    borderWidth: 2, borderColor: Colors.textLight,
    zIndex: 1,
  },
  railLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: -1 },

  historyCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    marginLeft: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  cardTime: { fontSize: 15, fontWeight: '600', color: Colors.text },
  cardRelative: { fontSize: 13, color: Colors.textSecondary },
  cardEmpty: { fontSize: 13, color: Colors.textLight, marginBottom: 4 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  pillText: { fontSize: 12, fontWeight: '600' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  cardId: { fontSize: 11, color: Colors.textLight, fontFamily: 'Courier', fontWeight: '500' },
  cardChevron: { fontSize: 20, color: Colors.textLight, fontWeight: '400' },

  // ── Session detail header ──
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerBackBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  headerArrow: { fontSize: 22, color: Colors.primary, fontWeight: '400', marginRight: 2 },
  headerBackLabel: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
  headerMeta: { fontSize: 12, color: Colors.textSecondary, fontFamily: 'Courier' },

  // ── Filter bar ──
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.background,
    gap: 6,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.surface },
  chipLabel: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  chipLabelActive: { color: '#FFFFFF' },
  chipCount: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  chipCountActive: { color: 'rgba(255,255,255,0.8)' },

  // ── Log rows (inside LogListScreen cards) ──
  rowContent: { flexDirection: 'row', padding: 14, alignItems: 'flex-start' },
  levelDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 1,
  },
  levelIcon: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  statusBar: { width: 3, borderRadius: 2, marginRight: 12, minHeight: 36 },
  rowBody: { flex: 1 },
  rowMsg: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  rowTime: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  methodText: { fontSize: 13, fontWeight: '700' },
  miniPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  miniPillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  trackDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.purple, marginRight: 10, marginTop: 5 },

  // ── Log detail header ──
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  levelBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  detailTimestamp: { flex: 1, fontSize: 13, color: Colors.textSecondary, textAlign: 'right' },
  networkHeaderBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  methodBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  methodBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  durationText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  // ── Log detail body ──
  detailBody: { flex: 1 },
  detailBodyContent: { padding: 12, paddingBottom: 40 },
  sectionWithCopy: { gap: 8 },
  plainText: { fontFamily: 'Courier', fontSize: 13, color: Colors.text, lineHeight: 20 },

  urlCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12, padding: 14, marginBottom: 8, gap: 8,
  },
  urlText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  emptySection: { fontSize: 13, color: Colors.textLight, paddingVertical: 4 },
  errorBox: {
    backgroundColor: 'rgba(255,59,48,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,59,48,0.15)',
    borderRadius: 10, padding: 12, marginBottom: 10,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  errorIcon: { fontSize: 14, color: Colors.error },
  errorText: { flex: 1, fontSize: 13, color: Colors.error, lineHeight: 18 },
});
