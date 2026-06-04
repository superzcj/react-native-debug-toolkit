import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Colors } from '../theme/colors';
import { useSlideDetailAnimation } from './useSlideDetailAnimation';

interface LogListItem {
  id: string;
}

interface LogListScreenProps<T extends LogListItem> {
  data: T[];
  renderRow: (item: T) => React.ReactElement;
  renderListHeader?: () => React.ReactElement;
  renderDetailHeader?: (item: T) => React.ReactNode;
  renderDetailBody: (item: T) => React.ReactElement;
  emptyText: string;
  reversed?: boolean;
}

/**
 * Shared list→detail screen with slide animation.
 * Handles: selected state, FlatList, empty state, back button, push navigation.
 * Each tab provides renderRow, renderDetailBody, and optional renderDetailHeader.
 */
export function LogListScreen<T extends LogListItem>({
  data,
  renderRow,
  renderListHeader,
  renderDetailHeader,
  renderDetailBody,
  emptyText,
  reversed = true,
}: LogListScreenProps<T>) {
  const [selected, setSelected] = useState<T | null>(null);
  const { detailTranslateX, listTranslateX, listOpacity } = useSlideDetailAnimation(selected);

  const displayData = useMemo(
    () => (reversed ? [...data].reverse() : data),
    [data, reversed],
  );

  return (
    <View style={styles.container}>
      {/* List */}
      <Animated.View
        style={[
          styles.listWrap,
          selected
            ? { opacity: listOpacity, transform: [{ translateX: listTranslateX }] }
            : null,
        ]}
      >
        {renderListHeader?.()}
        {displayData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{"—"}</Text>
            <Text style={styles.empty}>{emptyText}</Text>
          </View>
        ) : (
          <FlatList
            data={displayData}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setSelected(item)}
                activeOpacity={0.6}
              >
                {renderRow(item)}
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
          />
        )}
      </Animated.View>

      {/* Detail */}
      {selected && (
        <Animated.View
          style={[styles.detailOverlay, { transform: [{ translateX: detailTranslateX }] }]}
        >
          <View style={styles.detailWrap}>
            <View style={styles.detailHeader}>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                style={styles.backBtn}
                activeOpacity={0.6}
              >
                <Text style={styles.backIcon}>‹</Text>
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              {renderDetailHeader?.(selected)}
            </View>
            {renderDetailBody(selected)}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  listContent: { padding: 12 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 36, color: Colors.textSecondary, marginBottom: 4 },
  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 13 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
  },
  detailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
  },
  detailWrap: { flex: 1, backgroundColor: Colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: '300',
    color: Colors.primary,
    marginTop: -2,
    marginRight: 2,
  },
  backText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '500',
  },
});
