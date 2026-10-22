import React, { useState } from 'react';
import {
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DebugFeatureRenderProps } from '../../types/feature';
import type { LogChannelEntry } from '../../types/logChannel';
import { Colors } from '../../ui/theme/colors';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { CopyButton } from '../../ui/shared/CopyButton';
import { channelRawText, selectChannelLogs } from './presentation';
import type { LogChannelFeature } from './index';
import { getLocale } from '../../i18n';

export function LogChannelTab({
  snapshot,
  feature,
  searchQuery = '',
}: DebugFeatureRenderProps<LogChannelEntry[]>) {
  const [includeDetail, setIncludeDetail] = useState(false);
  const [paused, setPaused] = useState<LogChannelEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const zh = getLocale() === 'zh-CN';
  const limits = (feature as Partial<LogChannelFeature>).limits;
  const rows = selectChannelLogs(
    paused ?? snapshot,
    includeDetail,
    searchQuery,
  );
  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setIncludeDetail((value) => !value)}
        >
          <Text style={styles.action}>
            {includeDetail
              ? zh
                ? '隐藏过程'
                : 'Hide process'
              : zh
                ? '包含过程日志'
                : 'Include process'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setPaused((value) => (value ? null : snapshot))}
        >
          <Text style={styles.action}>
            {paused ? (zh ? '继续显示' : 'Resume') : zh ? '暂停显示' : 'Pause'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            setError(null);
            void Share.share({
              title: feature.label,
              message: channelRawText(feature.getSnapshot()),
            }).catch(() =>
              setError(zh ? '导出失败，请重试' : 'Export failed. Retry.'),
            );
          }}
        >
          <Text style={styles.action}>
            {zh ? '导出全部原始日志' : 'Export all raw logs'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => {
            feature.clear?.();
            setPaused(null);
          }}
        >
          <Text style={styles.action}>
            {zh ? '清空本机' : 'Clear on phone'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.note}>
        {zh
          ? `显示 ${rows.length} 条 · 保留 ${snapshot.length} 条`
          : `${rows.length} shown · ${snapshot.length} retained`}
      </Text>
      {!!limits && (
        <Text style={styles.note}>
          {zh
            ? `最多保留 ${limits.maxLogs} 条 / ${Math.round(limits.maxBytes / 1024)} KiB`
            : `Retention: ${limits.maxLogs} entries / ${Math.round(limits.maxBytes / 1024)} KiB`}
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={styles.note}>
          {error}
        </Text>
      )}
      <FlatList
        data={rows}
        keyExtractor={(entry) => entry.id}
        initialNumToRender={15}
        windowSize={5}
        ListEmptyComponent={
          <Text style={styles.note}>
            {zh ? '暂无匹配的日志' : 'No matching logs'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.time}>
                {new Date(item.timestamp).toLocaleTimeString()}
              </Text>
              <Text style={styles.time}>
                {item.category?.toUpperCase() ?? item.level ?? 'LOG'}
              </Text>
            </View>
            <Text selectable style={styles.summary}>
              {item.summary ?? item.message}
            </Text>
            {item.truncated && (
              <Text style={styles.warning}>
                {zh
                  ? `已截断 · 原 ${item.originalBytes} 字节`
                  : `Truncated · originally ${item.originalBytes} bytes`}
              </Text>
            )}
            {!!item.attachments?.length && (
              <CollapsibleSection compact title={zh ? '报文' : 'Payload'}>
                {item.attachments.map((part, index) => (
                  <View key={index}>
                    <Text style={styles.note}>{part.label}</Text>
                    <Text selectable style={styles.original}>
                      {part.value}
                    </Text>
                    <CopyButton text={part.value} label={part.label} />
                  </View>
                ))}
              </CollapsibleSection>
            )}
            <CollapsibleSection compact title={zh ? '原始详情' : 'Raw details'}>
              <CopyButton
                text={JSON.stringify(item, null, 2)}
                label={zh ? '原始 JSON' : 'Raw JSON'}
              />
              <Text selectable style={styles.original}>
                {JSON.stringify(item, null, 2)}
              </Text>
            </CollapsibleSection>
          </View>
        )}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 12 },
  action: { color: Colors.primary, fontSize: 12, paddingVertical: 6 },
  note: {
    color: Colors.textSecondary,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    padding: 12,
    gap: 6,
  },
  rowHeader: { flexDirection: 'row', gap: 12 },
  time: { fontSize: 12, color: Colors.textSecondary },
  summary: { fontSize: 14, fontWeight: '500', color: Colors.text },
  original: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
    color: Colors.text,
  },
  warning: { fontSize: 12, color: Colors.warning },
});
