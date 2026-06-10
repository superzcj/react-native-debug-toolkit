import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { useSlideDetailAnimation } from './useSlideDetailAnimation';
import { useStaggerAnimation } from '../panel/useStaggerAnimation';
import { getFilterConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const { getAnim, staggerIn } = useStaggerAnimation();
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const reducedMotion = useReduceMotion();
  const filterConfig = getFilterConfig(reducedMotion);
  const prevDataLength = useRef(data.length);

  // Smooth layout transition when items are filtered
  useEffect(() => {
    if (prevDataLength.current !== data.length) {
      LayoutAnimation.configureNext({
        duration: filterConfig.fadeOutDuration,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      prevDataLength.current = data.length;
    }
  }, [data.length, filterConfig.fadeOutDuration]);

  const onViewableItemsChanged = useRef(({ changed }: { changed: Array<{ index: number | null; isViewable: boolean }> }) => {
    const visible = changed
      .filter((v) => v.isViewable && v.index !== null)
      .map((v) => v.index!);
    if (visible.length > 0) staggerIn(visible);
  }).current;

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
            renderItem={({ item, index }) => {
              const itemOpacity = getAnim(index);
              return (
                <Animated.View style={{ opacity: itemOpacity }}>
                  <TouchableOpacity
                    style={styles.card}
                    onPress={() => setSelected(item)}
                    activeOpacity={0.6}
                  >
                    {renderRow(item)}
                  </TouchableOpacity>
                </Animated.View>
              );
            }}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
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
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
    borderBottomColor: Colors.panelDivider,
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
