import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import { LogRow, LogRowMetaText } from '../../ui/shared/LogRow';
import { fmt } from '../../utils/copyToComputer';
import type { DebugFeatureRenderProps, NativeLogEntry } from '../../types';

const LEVEL_COLORS: Record<string, string> = {
  trace: Colors.textMuted, debug: Colors.textMuted, info: Colors.primary,
  warn: Colors.warning, error: Colors.error, fatal: Colors.error, unknown: Colors.textMuted,
};

export function renderNativeLogRow(item: NativeLogEntry) {
  const source = [item.platform, item.source, item.tag].filter(Boolean).join(' / ');
  return (
    <LogRow
      content={item.message}
      contentStyle={s.message}
      metadata={(
        <>
          <View style={[s.level, { backgroundColor: LEVEL_COLORS[item.level] ?? LEVEL_COLORS.unknown }]}>
            <Text style={s.levelText}>{item.level.slice(0, 1).toUpperCase()}</Text>
          </View>
          {!!source && <LogRowMetaText style={s.meta}>{source}</LogRowMetaText>}
        </>
      )}
      trailingMetadata={(
        <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      )}
    />
  );
}

export const NativeLogTab: React.FC<DebugFeatureRenderProps<NativeLogEntry[]>> = React.memo(({ snapshot }) => (
  <LogListScreen
    data={snapshot}
    emptyText="No native logs"
    renderRow={renderNativeLogRow}
    renderDetailHeader={(item) => (
      <>
        <View style={[s.badge, { backgroundColor: LEVEL_COLORS[item.level] ?? LEVEL_COLORS.unknown }]}>
          <Text style={s.badgeText}>{item.level.toUpperCase()}</Text>
        </View>
        <Text style={s.detailTime}>{new Date(item.timestamp).toLocaleString()}</Text>
      </>
    )}
    renderDetailBody={(item) => (
      <ScrollView style={s.detailBody} contentContainerStyle={s.detailContent}>
        <View style={s.copyRow}>
          <CopyButton text={fmt(item)} label="Native Log" />
        </View>
        <Text style={s.messageBlock} selectable>{item.message}</Text>
        <Text style={s.rawBlock} selectable>{fmt(item)}</Text>
      </ScrollView>
    )}
  />
));

const s = StyleSheet.create({
  level: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { color: Colors.textInverse, fontSize: FontSize.XS, fontWeight: FontWeight.bold },
  message: { fontSize: FontSize.MD, color: Colors.text, lineHeight: 20 },
  meta: { fontSize: FontSize.XS, color: Colors.textSecondary },
  time: { fontSize: FontSize.XS, color: Colors.textSecondary },
  badge: { paddingHorizontal: Spacing.MD, paddingVertical: Spacing.XXS, borderRadius: Radius.SM },
  badgeText: { color: Colors.textInverse, fontSize: FontSize.SM, fontWeight: FontWeight.bold },
  detailTime: { flex: 1, fontSize: FontSize.SM, color: Colors.textSecondary, textAlign: 'right' },
  detailBody: { flex: 1 },
  detailContent: { padding: Spacing.MD, gap: Spacing.MD },
  copyRow: { alignItems: 'flex-end' },
  messageBlock: { fontFamily: 'Courier', fontSize: FontSize.SM, color: Colors.text, lineHeight: 20 },
  rawBlock: { fontFamily: 'Courier', fontSize: FontSize.XS, color: Colors.textSecondary, lineHeight: 18 },
});
