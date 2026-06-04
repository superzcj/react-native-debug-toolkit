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
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
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
            <Text style={styles.emptyIcon}>—</Text>
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
  listContent: { padding: Spacing.SM },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { fontSize: 32, color: Colors.textMuted, marginBottom: Spacing.XS },
  empty: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.SM },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    marginBottom: Spacing.SM,
    overflow: 'hidden',
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
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.SM,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.XS,
    paddingVertical: 2,
    borderRadius: Radius.SM,
  },
  backIcon: {
    fontSize: 22,
    fontWeight: FontWeight.regular,
    color: Colors.primary,
    marginTop: -2,
    marginRight: Spacing.XXS,
  },
  backText: {
    fontSize: FontSize.LG,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },
});
