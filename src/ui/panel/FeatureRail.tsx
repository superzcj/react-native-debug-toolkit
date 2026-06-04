import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing, RAIL_WIDTH } from '../theme/layout';

const SHORT_LABEL_MAP: Record<string, string> = {
  network: 'Net',
  console: 'Log',
  native: 'Native',
  navigation: 'Nav',
  zustand: 'State',
  track: 'Track',
  clipboard: 'Clip',
  environment: 'Env',
  devConnect: 'Dev',
  sessionHistory: 'Session',
  thirdPartyLibs: 'Libs',
};

export function shortLabelForFeature(label: string, id: string): string {
  const mapped = SHORT_LABEL_MAP[id];
  if (mapped) return mapped;
  const trimmed = label.trim();
  return trimmed.toLowerCase().slice(0, 5);
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          const short = shortLabelForFeature(item.label, item.id);
          const dotColor = item.dotColor ?? null;
          const hasCount = item.count != null && item.count > 0;
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
              <Text
                style={[styles.itemName, isActive && styles.activeItemName]}
                numberOfLines={1}
              >
                {short}
              </Text>
              <View style={styles.itemMeta}>
                {dotColor && (
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                )}
                {hasCount && (
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{item.count}</Text>
                  </View>
                )}
              </View>
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
  },
  scrollContent: {
    paddingVertical: Spacing.XS,
    paddingHorizontal: Spacing.XS,
    gap: 2,
  },
  item: {
    minHeight: 48,
    borderRadius: Radius.SM,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.SM,
    paddingHorizontal: Spacing.XXS,
    position: 'relative',
    overflow: 'hidden',
  },
  activeItem: {
    backgroundColor: Colors.railActiveBg,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 1,
    backgroundColor: Colors.railActiveBar,
  },
  itemName: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.railInactiveText,
  },
  activeItemName: {
    color: Colors.railActiveText,
    fontWeight: FontWeight.bold,
  },
  itemMeta: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  countPill: {
    minWidth: 16,
    height: 13,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.primary,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
