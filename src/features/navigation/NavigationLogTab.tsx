import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import { CopyButton } from '../../ui/shared/CopyButton';
import type { DebugFeatureRenderProps, NavigationLogEntry } from '../../types';

export const NavigationLogTab: React.FC<DebugFeatureRenderProps<NavigationLogEntry[]>> = React.memo(({
  snapshot,
}) => {
  const data = snapshot;
  const renderItem = ({ item }: { item: NavigationLogEntry }) => (
    <View style={styles.logItem}>
      <View style={styles.header}>
        <Text style={styles.action}>{item.action}</Text>
        <View style={styles.headerRight}>
          {item.duration != null && <Text style={styles.duration}>{item.duration}ms</Text>}
          <CopyButton
            text={`${item.action}: ${item.from || '—'} → ${item.to}`}
            label="Navigation"
            compact
          />
        </View>
      </View>
      <View style={styles.routeRow}>
        <Text style={styles.routeLabel}>From:</Text>
        <Text style={styles.routeValue}>{item.from || '—'}</Text>
      </View>
      <View style={styles.routeRow}>
        <Text style={styles.routeLabel}>To:</Text>
        <Text style={styles.routeValue}>{item.to}</Text>
      </View>
      <Text style={styles.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
    </View>
  );

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
    padding: Spacing.MD,
    marginBottom: Spacing.SM,
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.XS },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.SM },
  action: { fontSize: FontSize.MD, fontWeight: FontWeight.bold, color: Colors.primary },
  duration: { fontSize: FontSize.SM, color: Colors.textMuted },
  routeRow: { flexDirection: 'row', marginBottom: 2 },
  routeLabel: { fontSize: FontSize.SM, color: Colors.textSecondary, marginRight: Spacing.SM, fontWeight: FontWeight.semibold },
  routeValue: { fontSize: FontSize.SM, color: Colors.text, flex: 1 },
  time: { fontSize: FontSize.XS, color: Colors.textMuted, marginTop: Spacing.XXS },
});
