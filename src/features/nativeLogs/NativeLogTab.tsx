import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import { Colors } from '../../ui/theme/colors';
import { fmt } from '../../utils/copyToComputer';
import type { DebugFeatureRenderProps, NativeLogEntry } from '../../types';

const LEVEL_COLORS: Record<string, string> = {
  trace: '#8E8E93', debug: '#8E8E93', info: '#007AFF',
  warn: '#FF9500', error: '#FF3B30', fatal: '#AF52DE', unknown: '#8E8E93',
};

export const NativeLogTab: React.FC<DebugFeatureRenderProps<NativeLogEntry[]>> = React.memo(({ snapshot }) => (
  <LogListScreen
    data={snapshot}
    emptyText="No native logs"
    renderRow={(item) => (
      <View style={s.row}>
        <View style={[s.level, { backgroundColor: LEVEL_COLORS[item.level] ?? LEVEL_COLORS.unknown }]}>
          <Text style={s.levelText}>{item.level.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={s.content}>
          <Text style={s.message} numberOfLines={2}>{item.message}</Text>
          <Text style={s.meta}>
            {[item.platform, item.source, item.tag].filter(Boolean).join(' / ')} · {new Date(item.timestamp).toLocaleTimeString()}
          </Text>
        </View>
      </View>
    )}
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
  row: { flexDirection: 'row', padding: 14, alignItems: 'flex-start' },
  level: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  levelText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  message: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  detailTime: { flex: 1, fontSize: 13, color: Colors.textSecondary, textAlign: 'right' },
  detailBody: { flex: 1 },
  detailContent: { padding: 12, gap: 12 },
  copyRow: { alignItems: 'flex-end' },
  messageBlock: { fontFamily: 'Courier', fontSize: 13, color: Colors.text, lineHeight: 20 },
  rawBlock: { fontFamily: 'Courier', fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
});
