import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import type { FeatureSummary } from './buildFeatureSummary';

function hexWithAlpha(hex: string, alpha: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex + alpha;
  return Colors.signalDefaultBg;
}

interface FeatureIntroCardProps {
  title: string;
  summary: FeatureSummary;
  filterBad: boolean;
  onFilterBad: (bad: boolean) => void;
}

export function FeatureIntroCard({
  title,
  summary,
  filterBad,
  onFilterBad,
}: FeatureIntroCardProps) {
  const {
    statusLabel,
    statusColor,
    supportsBadFilter,
  } = summary;

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
      </View>
      {supportsBadFilter && (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.chip, !filterBad && styles.chipActive]}
            onPress={() => onFilterBad(false)}
          >
            <Text style={[styles.chipText, !filterBad && styles.chipTextActive]}>All</Text>
          </Pressable>
          {supportsBadFilter && (
            <Pressable
              style={[styles.chip, filterBad && styles.chipBadActive]}
              onPress={() => onFilterBad(true)}
            >
              <Text style={[styles.chipText, filterBad && styles.chipTextBad]}>Bad</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: Colors.signalDefaultBg,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    height: 26,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.text,
    borderColor: Colors.text,
  },
  chipBadActive: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  chipTextBad: {
    color: '#fff',
  },
});
