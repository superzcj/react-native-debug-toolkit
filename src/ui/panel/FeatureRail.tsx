import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing, RAIL_WIDTH } from '../theme/layout';
import { t } from '../../i18n';
import { FEATURE_LABELS, FEATURE_LABEL_KEYS, FEATURE_SHORT_LABEL_KEYS, type BuiltinFeatureKey } from '../../core/featureCatalog';

export function shortLabelForFeature(label: string, id: string): string {
  const name = id as BuiltinFeatureKey;
  const mapped = FEATURE_SHORT_LABEL_KEYS[name];
  const fullKey = FEATURE_LABEL_KEYS[name];
  if (mapped && (
    label.trim() === FEATURE_LABELS[name]
    || (fullKey && label.trim() === t(fullKey))
  )) {
    return t(mapped);
  }
  return label.trim().slice(0, 12);
}

export interface RailItem {
  id: string;
  label: string;
  dotColor?: string | null;
  count?: number;
  disabled?: boolean;
}

interface FeatureRailProps {
  items: RailItem[];
  activeIndex: number;
  onSelectTab: (index: number) => void;
}

export function FeatureRail({ items, activeIndex, onSelectTab }: FeatureRailProps) {
  return (
    <View style={styles.rail}>
      <View pointerEvents="none" style={styles.topGlow} />
      <View pointerEvents="none" style={styles.bottomShade} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          const label = shortLabelForFeature(item.label, item.id);
          const hasCount = item.count != null && item.count > 0;
          const countLabel = hasCount && item.count != null && item.count > 99 ? '99+' : item.count;

          return (
            <Pressable
              key={item.id}
              testID={`debug-tab-${item.id}`}
              onPress={() => onSelectTab(index)}
              disabled={item.disabled}
              style={[styles.item, isActive && styles.activeItem, item.disabled && styles.disabledItem]}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive, disabled: item.disabled }}
            >
              {isActive && <View style={styles.activeBar} />}
              <Text style={[styles.itemText, isActive && styles.activeItemText]} numberOfLines={1}>
                {label}
              </Text>
              {hasCount && (
                <View style={[styles.countPill, isActive && styles.activeCountPill]}>
                  <Text style={[styles.countText, isActive && styles.activeCountText]}>{countLabel}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    backgroundColor: Colors.railBackground,
    borderRightWidth: 1,
    borderRightColor: Colors.panelDivider,
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: -36,
    left: -20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(77,163,255,0.06)',
  },
  bottomShade: {
    position: 'absolute',
    bottom: -34,
    left: 0,
    right: 0,
    height: 96,
    backgroundColor: Colors.railShade,
  },
  scrollContent: {
    paddingVertical: Spacing.SM,
    paddingHorizontal: Spacing.XS,
    // Let the last item scroll above LogBox and the Android navigation bar.
    paddingBottom: 80 + (Platform.OS === 'android' ? 48 : 0),
    gap: 2,
  },
  item: {
    minHeight: 52,
    borderRadius: Radius.MD,
    paddingHorizontal: Spacing.XXS,
    paddingVertical: Spacing.SM,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabledItem: { opacity: 0.5 },
  activeItem: {
    backgroundColor: Colors.railActiveBg,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: Colors.railActiveBar,
  },
  itemText: {
    color: Colors.railInactiveText,
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
  },
  activeItemText: {
    color: Colors.railActiveText,
  },
  countPill: {
    marginTop: 3,
    minWidth: 18,
    height: 14,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCountPill: {
    backgroundColor: Colors.primary,
  },
  countText: {
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  activeCountText: {
    color: Colors.textInverse,
  },
});
