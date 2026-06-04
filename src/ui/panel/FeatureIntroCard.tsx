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
  const metrics = [
    summary.count != null ? `${summary.count} captured` : null,
    summary.badCount != null ? `${summary.badCount} bad` : null,
    summary.latestLabel ? `latest ${summary.latestLabel}` : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <View style={styles.bar}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {metrics.length > 0 && (
            <View style={styles.metricRow}>
              {metrics.map((metric, index) => (
                <Text
                  key={`${metric}-${index}`}
                  style={[styles.metricText, index === metrics.length - 1 && styles.latestMetric]}
                  numberOfLines={1}
                >
                  {metric}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View style={styles.actionBlock}>
          {statusLabel && (
            <View style={[styles.statusChip, statusColor && { backgroundColor: hexWithAlpha(statusColor, '18') }]}>
              <View style={[styles.statusDot, statusColor && { backgroundColor: statusColor }]} />
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
      </View>
      {showSearch && (
        <TextInput
          style={styles.searchInput}
          placeholder="Search"
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
  bar: {
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.SM,
    borderBottomWidth: 1,
    borderBottomColor: Colors.panelDivider,
    backgroundColor: Colors.surface,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.SM,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: FontSize.MD,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
    marginTop: Spacing.XS,
    minWidth: 0,
  },
  metricText: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
  },
  latestMetric: {
    flex: 1,
    minWidth: 0,
    color: Colors.textSecondary,
  },
  actionBlock: {
    alignItems: 'flex-end',
    gap: Spacing.XS,
    maxWidth: 174,
  },
  statusChip: {
    maxWidth: 174,
    minHeight: 22,
    paddingHorizontal: Spacing.SM,
    paddingVertical: 3,
    borderRadius: Radius.MD,
    backgroundColor: Colors.primaryGhost,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  statusText: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  filterRow: {
    flexDirection: 'row',
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  chip: {
    height: 24,
    minWidth: 42,
    paddingHorizontal: Spacing.SM,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceInset,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipBadActive: {
    backgroundColor: Colors.error,
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
    borderColor: Colors.borderLight,
    borderRadius: Radius.MD,
    backgroundColor: Colors.surfaceInset,
    paddingHorizontal: Spacing.MD,
    fontSize: FontSize.MD,
    color: Colors.text,
    marginTop: Spacing.SM,
  },
});
