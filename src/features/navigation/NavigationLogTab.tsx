import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogRow } from '../../ui/shared/LogRow';
import type { DebugFeatureRenderProps, NavigationLogEntry } from '../../types';

export function renderNavigationLogRow(item: NavigationLogEntry) {
  return (
    <View style={styles.logItem}>
      <LogRow
        content={`${item.from || '—'} → ${item.to}`}
        contentStyle={styles.routeValue}
        metadata={<Text style={styles.action}>{item.action}</Text>}
        trailingMetadata={(
          <>
            {item.duration != null && <Text style={styles.duration}>{item.duration}ms</Text>}
            <CopyButton
              text={`${item.action}: ${item.from || '—'} → ${item.to}`}
              label="Navigation"
              compact
            />
            <Text style={styles.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
          </>
        )}
      />
    </View>
  );
}

export const NavigationLogTab: React.FC<DebugFeatureRenderProps<NavigationLogEntry[]>> = React.memo(({
  snapshot,
}) => {
  const data = snapshot;
  const renderItem = ({ item }: { item: NavigationLogEntry }) => renderNavigationLogRow(item);

  return (
    <View style={styles.container}>
      {data.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>No navigation events</Text>
        </View>
      ) : (
        <FlatList
          data={[...data].reverse()}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.SM },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.SM },
  logItem: {
    marginBottom: Spacing.SM,
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
  },
  action: { fontSize: FontSize.MD, fontWeight: FontWeight.bold, color: Colors.primary },
  duration: { fontSize: FontSize.SM, color: Colors.textMuted },
  routeValue: { fontSize: FontSize.SM, color: Colors.text, lineHeight: 18 },
  time: { fontSize: FontSize.XS, color: Colors.textMuted },
});
