import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing, RAIL_WIDTH } from '../theme/layout';

const LABEL_MAP: Record<string, string> = {
  network: 'Net',
  console: 'Logs',
  native: 'Native',
  navigation: 'Nav',
  zustand: 'State',
  track: 'Track',
  clipboard: 'Clip',
  environment: 'Env',
  devConnect: 'Connect',
  sessionHistory: 'Sessions',
  thirdPartyLibs: 'Libs',
};

export function shortLabelForFeature(label: string, id: string): string {
  const mapped = LABEL_MAP[id];
  if (mapped) return mapped;
  return label.trim().slice(0, 12);
}

export interface RailItem {
  id: string;
  label: string;
  dotColor?: string | null;
  count?: number;
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
              onPress={() => onSelectTab(index)}
              style={[styles.item, isActive && styles.activeItem]}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
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
    backgroundColor: Colors.glassRail,
    borderRightWidth: 1,
    borderRightColor: Colors.glassStroke,
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
    gap: 2,
  },
  item: {
    minHeight: 52,
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.XXS,
    paddingVertical: Spacing.SM,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeItem: {
    backgroundColor: Colors.railActiveBg,
    borderWidth: 1,
    borderColor: Colors.glassStroke,
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
