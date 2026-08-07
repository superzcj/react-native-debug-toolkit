import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import { safeStringify } from '../../utils/safeStringify';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { JsonView } from '../../ui/shared/JsonView';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import { LogRow, LogRowMetaText } from '../../ui/shared/LogRow';
import type { DebugFeatureRenderProps, ZustandLogEntry } from '../../types';

/** Middleware / subscribe fallbacks that are not useful as a list title. */
const GENERIC_ACTIONS = new Set(['setState', 'object-set', 'set']);

const getActionColor = (action: string): string => {
  if (action.includes('add') || action.includes('create')) return Colors.success;
  if (action.includes('remove') || action.includes('delete')) return Colors.error;
  if (action.includes('update') || action.includes('set')) return Colors.primary;
  return Colors.info;
};

const getActionBgColor = (action: string): string => {
  if (action.includes('add') || action.includes('create')) return Colors.successDim;
  if (action.includes('remove') || action.includes('delete')) return Colors.errorDim;
  if (action.includes('update') || action.includes('set')) return Colors.primaryGhost;
  return 'rgba(14,165,233,0.12)';
};

export function findZustandChanges(prev: unknown, next: unknown): string[] {
  if (typeof prev !== 'object' || typeof next !== 'object' || !prev || !next) return [];
  const allKeys = new Set([...Object.keys(prev as object), ...Object.keys(next as object)]);
  const changed: string[] = [];
  allKeys.forEach((key) => {
    const pv = (prev as Record<string, unknown>)[key];
    const nv = (next as Record<string, unknown>)[key];
    // Skip action methods — only surface state field diffs.
    if (typeof pv === 'function' || typeof nv === 'function') return;
    if (safeStringify(pv) !== safeStringify(nv)) changed.push(key);
  });
  return changed;
}

/**
 * List title = what changed (keys / named action).
 * Store name belongs in the footer — same split as Navigation (route vs action).
 */
export function resolveZustandLogTitle(item: ZustandLogEntry): {
  title: string;
  colorKey: string;
  namedAction: string | null;
  changes: string[];
} {
  const changes = findZustandChanges(item.prevState, item.nextState);
  const namedAction =
    item.action && !GENERIC_ACTIONS.has(item.action) ? item.action : null;

  if (changes.length > 0) {
    return {
      title: changes.join(', '),
      colorKey: namedAction ?? 'update',
      namedAction,
      changes,
    };
  }
  if (namedAction) {
    return {
      title: namedAction,
      colorKey: namedAction,
      namedAction,
      changes,
    };
  }
  return {
    title: 'state change',
    colorKey: 'update',
    namedAction: null,
    changes,
  };
}

export function renderZustandLogRow(item: ZustandLogEntry) {
  const { title, colorKey, namedAction } = resolveZustandLogTitle(item);

  return (
    <LogRow
      content={title}
      contentStyle={s.action}
      metadata={(
        <>
          <View style={[s.actionIcon, { backgroundColor: getActionBgColor(colorKey) }]}>
            <View style={[s.actionDot, { backgroundColor: getActionColor(colorKey) }]} />
          </View>
          {item.storeName ? (
            <LogRowMetaText style={s.storeName}>{item.storeName}</LogRowMetaText>
          ) : null}
          {namedAction && namedAction !== title ? (
            <View style={s.actionBadge}>
              <Text style={s.actionBadgeText}>{namedAction}</Text>
            </View>
          ) : null}
        </>
      )}
      trailingMetadata={(
        <>
          {item.actionCompleteTime != null && (
            <View style={s.durationBadge}>
              <Text style={s.durationText}>{item.actionCompleteTime}ms</Text>
            </View>
          )}
          <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        </>
      )}
    />
  );
}

export const ZustandLogTab: React.FC<DebugFeatureRenderProps<ZustandLogEntry[]>> = React.memo(({
  snapshot,
}) => (
  <LogListScreen
    data={snapshot}
    emptyText="No Zustand state changes"
    renderRow={renderZustandLogRow}
    renderDetailHeader={(item) => {
      const { title, colorKey } = resolveZustandLogTitle(item);
      return (
        <View style={s.detailHeaderCenter}>
          <Text style={[s.detailAction, { color: getActionColor(colorKey) }]}>
            {title}
          </Text>
          {item.storeName ? (
            <View style={s.actionBadge}>
              <Text style={s.actionBadgeText}>{item.storeName}</Text>
            </View>
          ) : null}
        </View>
      );
    }}
    renderDetailBody={(item) => {
      const { namedAction } = resolveZustandLogTitle(item);
      const changes = findZustandChanges(item.prevState, item.nextState);
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

          {(item.storeName || namedAction) ? (
            <View style={s.metaCard}>
              {item.storeName ? (
                <View style={s.metaItem}>
                  <Text style={s.metaLabel}>Store</Text>
                  <Text style={s.metaValue}>{item.storeName}</Text>
                </View>
              ) : null}
              {item.storeName && namedAction ? <View style={s.metaDivider} /> : null}
              {namedAction ? (
                <View style={s.metaItem}>
                  <Text style={s.metaLabel}>Action</Text>
                  <Text style={s.metaValue}>{namedAction}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

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
              <JsonView data={item.prevState} maxHeight={250} highlightKeys={changes} />
            </View>
          </CollapsibleSection>

          <CollapsibleSection title="Next State" initiallyExpanded>
            <View style={s.sectionWithCopy}>
              <CopyButton text={safeStringify(item.nextState, 2)} label="Next State" />
              <JsonView data={item.nextState} maxHeight={250} highlightKeys={changes} />
            </View>
          </CollapsibleSection>
        </ScrollView>
      );
    }}
  />
));

const s = StyleSheet.create({
  actionIcon: {
    width: 26,
    height: 26,
    borderRadius: Radius.SM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDot: { width: 8, height: 8, borderRadius: 4 },
  action: { fontSize: FontSize.MD, fontWeight: FontWeight.semibold, color: Colors.text },
  storeName: {
    color: Colors.textSecondary,
    fontSize: FontSize.XS,
    fontWeight: FontWeight.medium,
  },
  actionBadge: {
    backgroundColor: Colors.primaryGhost,
    paddingHorizontal: Spacing.SM,
    paddingVertical: 1,
    borderRadius: Radius.XS,
  },
  actionBadgeText: { fontSize: FontSize.XS, color: Colors.primary, fontWeight: FontWeight.semibold },
  time: { fontSize: FontSize.XS, color: Colors.textSecondary },
  durationBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.SM,
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XXS,
  },
  durationText: { fontSize: FontSize.XS, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  detailHeaderCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
    flex: 1,
  },
  detailAction: { fontSize: FontSize.LG, fontWeight: FontWeight.bold },

  detailBody: { flex: 1 },
  detailBodyContent: { padding: Spacing.MD, paddingBottom: 40 },
  sectionWithCopy: { gap: Spacing.SM },

  metaCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    padding: Spacing.MD,
    marginBottom: Spacing.SM,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: { flex: 1 },
  metaDivider: { width: 1, height: 28, backgroundColor: Colors.border, marginHorizontal: Spacing.MD },
  metaLabel: { fontSize: FontSize.XS, color: Colors.textSecondary, fontWeight: FontWeight.semibold, textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: FontSize.MD, color: Colors.text, fontWeight: FontWeight.medium },

  changesCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    padding: Spacing.MD,
    marginBottom: Spacing.SM,
  },
  changesTitle: { fontSize: FontSize.SM, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: Spacing.SM },
  changesTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.XXS },
  changeTag: {
    backgroundColor: Colors.warningDim,
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XXS,
    borderRadius: Radius.XS,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  changeTagText: { fontSize: FontSize.XS, color: Colors.warning, fontWeight: FontWeight.semibold },
});
