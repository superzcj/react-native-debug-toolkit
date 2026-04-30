import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
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
        <Text style={styles.empty}>No navigation events</Text>
      ) : (
        <FlatList
          data={[...data].reverse()}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 20 },
  logItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { fontSize: 14, fontWeight: 'bold', color: Colors.primary },
  duration: { fontSize: 13, color: Colors.textLight },
  routeRow: { flexDirection: 'row', marginBottom: 3 },
  routeLabel: { fontSize: 13, color: Colors.textSecondary, marginRight: 8, fontWeight: '600' },
  routeValue: { fontSize: 13, color: Colors.text, flex: 1 },
  time: { fontSize: 12, color: Colors.textLight, marginTop: 4 },
});
