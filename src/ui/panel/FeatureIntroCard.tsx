import React from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import type { FeatureSummary } from './buildFeatureSummary';

function hexWithAlpha(hex: string, alpha: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex + alpha;
  return Colors.primaryGhost;
}

interface FeatureIntroCardProps {
  title: string;
  summary: FeatureSummary;
  filterBad: boolean;
  onFilterBad: (bad: boolean) => void;
  searchQuery?: string;
  onSearchChange?: (text: string) => void;
  showSearch?: boolean;
}

export function FeatureIntroCard({
  title,
  summary,
  filterBad,
  onFilterBad,
  searchQuery,
  onSearchChange,
  showSearch,
}: FeatureIntroCardProps) {
  const { statusLabel, statusColor, supportsBadFilter } = summary;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {statusLabel && (
          <View style={[styles.statusChip, statusColor && { backgroundColor: hexWithAlpha(statusColor, '18') }]}>
            <Text style={[styles.statusText, statusColor && { color: statusColor }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        )}
        {supportsBadFilter && (
          <View style={styles.filterRow}>
            <Pressable
              style={[styles.chip, !filterBad && styles.chipActive]}
              onPress={() => onFilterBad(false)}
            >
              <Text style={[styles.chipText, !filterBad && styles.chipTextActive]}>All</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, filterBad && styles.chipBadActive]}
              onPress={() => onFilterBad(true)}
            >
              <Text style={[styles.chipText, filterBad && styles.chipTextBad]}>Bad</Text>
            </Pressable>
          </View>
        )}
      </View>
      {showSearch && (
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.SM,
    paddingBottom: Spacing.SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
  },
  title: {
    fontSize: FontSize.MD,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  statusChip: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: 2,
    borderRadius: Radius.SM,
    backgroundColor: Colors.primaryGhost,
  },
  statusText: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.XS,
  },
  chip: {
    height: 24,
    paddingHorizontal: Spacing.MD,
    justifyContent: 'center',
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipBadActive: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },
  chipText: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.textInverse,
  },
  chipTextBad: {
    color: Colors.textInverse,
  },
  searchInput: {
    height: 32,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.LG,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.MD,
    fontSize: FontSize.MD,
    color: Colors.text,
    marginTop: Spacing.SM,
  },
});
