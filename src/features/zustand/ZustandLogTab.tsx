import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { safeStringify } from '../../utils/safeStringify';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { JsonView } from '../../ui/shared/JsonView';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import type { DebugFeatureRenderProps, ZustandLogEntry } from '../../types';

const getActionColor = (action: string): string => {
  if (action.includes('add') || action.includes('create')) return '#34C759';
  if (action.includes('remove') || action.includes('delete')) return '#FF3B30';
  if (action.includes('update') || action.includes('set')) return '#007AFF';
  return '#AF52DE';
};

const getActionBgColor = (action: string): string => {
  if (action.includes('add') || action.includes('create')) return 'rgba(52,199,89,0.1)';
  if (action.includes('remove') || action.includes('delete')) return 'rgba(255,59,48,0.1)';
  if (action.includes('update') || action.includes('set')) return 'rgba(0,122,255,0.1)';
  return 'rgba(175,82,222,0.1)';
};

function findChanges(prev: unknown, next: unknown): string[] {
  if (typeof prev !== 'object' || typeof next !== 'object' || !prev || !next) return [];
  const allKeys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]);
  const changed: string[] = [];
  allKeys.forEach((key) => {
    const pv = (prev as Record<string, unknown>)[key];
    const nv = (next as Record<string, unknown>)[key];
    if (safeStringify(pv) !== safeStringify(nv)) changed.push(key);
  });
  return changed;
}

export const ZustandLogTab: React.FC<DebugFeatureRenderProps<ZustandLogEntry[]>> = React.memo(({
  snapshot,
}) => (
  <LogListScreen
    data={snapshot}
    emptyText="No Zustand state changes"
    renderRow={(item) => (
      <View style={s.cardRow}>
        <View style={[s.actionIcon, { backgroundColor: getActionBgColor(item.action) }]}>
          <View style={[s.actionDot, { backgroundColor: getActionColor(item.action) }]} />
        </View>
        <View style={s.cardContent}>
          <View style={s.cardMeta}>
            <Text style={s.action}>{item.action}</Text>
            {item.storeName && (
              <View style={s.storeBadge}>
                <Text style={s.storeBadgeText}>{item.storeName}</Text>
              </View>
            )}
          </View>
          <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        </View>
        {item.actionCompleteTime != null && (
          <View style={s.durationBadge}>
            <Text style={s.durationText}>{item.actionCompleteTime}ms</Text>
          </View>
        )}
      </View>
    )}
    renderDetailHeader={(item) => (
      <View style={s.detailHeaderCenter}>
        <Text style={[s.detailAction, { color: getActionColor(item.action) }]}>
          {item.action}
        </Text>
        {item.storeName && (
          <View style={s.storeBadge}>
            <Text style={s.storeBadgeText}>{item.storeName}</Text>
          </View>
        )}
      </View>
    )}
    renderDetailBody={(item) => {
      const changes = findChanges(item.prevState, item.nextState);
      return (
        <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
          <View style={s.metaCard}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>Time</Text>
              <Text style={s.metaValue}>{new Date(item.timestamp).toLocaleString()}</Text>
            </View>
            {item.actionCompleteTime != null && <View style={s.metaDivider} />}
            {item.actionCompleteTime != null && (
              <View style={s.metaItem}>
                <Text style={s.metaLabel}>Duration</Text>
                <Text style={s.metaValue}>{item.actionCompleteTime}ms</Text>
              </View>
            )}
          </View>

          {changes.length > 0 && (
            <View style={s.changesCard}>
              <Text style={s.changesTitle}>Changed Keys</Text>
              <View style={s.changesTags}>
                {changes.map((key) => (
                  <View key={key} style={s.changeTag}>
                    <Text style={s.changeTagText}>{key}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <CollapsibleSection title="Previous State">
            <View style={s.sectionWithCopy}>
              <CopyButton text={safeStringify(item.prevState, 2)} label="Previous State" />
              <JsonView data={item.prevState} maxHeight={250} />
            </View>
          </CollapsibleSection>

          <CollapsibleSection title="Next State" initiallyExpanded>
            <View style={s.sectionWithCopy}>
              <CopyButton text={safeStringify(item.nextState, 2)} label="Next State" />
              <JsonView data={item.nextState} maxHeight={250} />
            </View>
          </CollapsibleSection>
        </ScrollView>
      );
    }}
  />
));

const s = StyleSheet.create({
  // Row
  cardRow: { flexDirection: 'row', padding: 14, alignItems: 'center' },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionDot: { width: 8, height: 8, borderRadius: 4 },
  cardContent: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  action: { fontSize: 15, fontWeight: '600', color: Colors.text },
  storeBadge: {
    backgroundColor: 'rgba(0,122,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  storeBadgeText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  time: { fontSize: 12, color: Colors.textSecondary },
  durationBadge: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durationText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  // Detail header
  detailHeaderCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  detailAction: { fontSize: 17, fontWeight: '700' },

  // Detail body
  detailBody: { flex: 1 },
  detailBodyContent: { padding: 12, paddingBottom: 40 },
  sectionWithCopy: { gap: 8 },

  // Meta
  metaCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: { flex: 1 },
  metaDivider: { width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: 12 },
  metaLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 14, color: Colors.text, fontWeight: '500' },

  // Changes
  changesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  changesTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 10 },
  changesTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  changeTag: {
    backgroundColor: 'rgba(0,122,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changeTagText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
});
