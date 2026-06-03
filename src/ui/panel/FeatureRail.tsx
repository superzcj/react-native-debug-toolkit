import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Colors } from '../theme/colors';

// ─── Label Model ──────────────────────────────────────

const SHORT_LABEL_MAP: Record<string, string> = {
  network: 'network',
  console: 'console',
  native: 'native',
  navigation: 'nav',
  zustand: 'zustand',
  track: 'track',
  clipboard: 'clip',
  environment: 'env',
  devConnect: 'dev',
  sessionHistory: 'session',
  thirdPartyLibs: 'libs',
};

export function shortLabelForFeature(label: string, id: string): string {
  const mapped = SHORT_LABEL_MAP[id];
  if (mapped) return mapped;
  const trimmed = label.trim();
  return trimmed.toLowerCase().slice(0, 7);
}

// ─── Rail Component ───────────────────────────────────

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

const RAIL_WIDTH = 80;

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    backgroundColor: Colors.railBackground,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.panelDivider,
  },
  scrollContent: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 3,
  },
  item: {
    minHeight: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  activeItem: {
    backgroundColor: Colors.surface,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.primary,
  },
  itemName: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  activeItemName: {
    color: Colors.text,
    fontWeight: '800',
  },
  itemMeta: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  countPill: {
    minWidth: 18,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.background,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
});
