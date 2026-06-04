import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import type { DebugFeatureRenderProps, EnvironmentState } from '../../types';
import type { EnvironmentFeatureAPI } from './index';

const DEFAULT_COLORS: Record<string, string> = {
  dev: '#22C55E',
  development: '#22C55E',
  staging: '#F59E0B',
  stage: '#F59E0B',
  production: '#EF4444',
  prod: '#EF4444',
};

export const EnvironmentTab: React.FC<DebugFeatureRenderProps<EnvironmentState>> = React.memo(({
  snapshot,
  feature,
}) => {
  const state = snapshot;
  if (!state || state.environments.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⚙</Text>
          <Text style={styles.emptyTitle}>No Environments</Text>
          <Text style={styles.emptyDesc}>
            Call{'\n'}
            <Text style={styles.code}>registerEnvironments([...])</Text>{'\n'}
            to configure environments.
          </Text>
        </View>
      </View>
    );
  }

  const { environments, currentEnvironmentId } = state;
  const envFeature = feature as unknown as EnvironmentFeatureAPI;

  const handleSelect = (envId: string) => {
    const nextId = currentEnvironmentId === envId ? null : envId;
    envFeature.switchEnvironment?.(nextId);
  };

  const activeEnv = environments.find((e) => e.id === currentEnvironmentId);

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.sectionTitle}>Switch Environment</Text>
        <Text style={styles.sectionDesc}>
          Rewrite API host in outgoing requests. Only registered hosts are affected.
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <View style={styles.groupedCard}>
          {environments.map((env, index) => {
            const isActive = currentEnvironmentId === env.id;
            const color = env.color || DEFAULT_COLORS[env.id.toLowerCase()] || Colors.primary;

            return (
              <TouchableOpacity
                key={env.id}
                style={[
                  styles.envItem,
                  isActive && styles.envItemActive,
                  index < environments.length - 1 && styles.envItemSeparator,
                ]}
                onPress={() => handleSelect(env.id)}
                activeOpacity={0.5}
              >
                <View style={styles.envRow}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <View style={styles.envInfo}>
                    <Text style={styles.envLabel}>{env.label}</Text>
                    <Text style={styles.envHost} numberOfLines={1}>
                      {env.host}
                    </Text>
                  </View>
                  {isActive && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {activeEnv ? (
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <View style={styles.footerActiveIndicator}>
              <View style={[styles.footerDot, { backgroundColor: activeEnv.color || DEFAULT_COLORS[activeEnv.id.toLowerCase()] || Colors.primary }]} />
              <Text style={styles.footerLabel}>Active</Text>
            </View>
            <Text style={styles.footerValue}>{activeEnv.label}</Text>
          </View>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => envFeature.switchEnvironment?.(null)}
            activeOpacity={0.7}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 32,
    color: Colors.textMuted,
    marginBottom: Spacing.SM,
  },
  emptyTitle: {
    fontSize: FontSize.XL,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.SM,
  },
  emptyDesc: {
    fontSize: FontSize.MD,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },

  headerSection: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.XL,
    paddingBottom: Spacing.MD,
  },
  sectionTitle: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.XXS,
  },
  sectionDesc: {
    fontSize: FontSize.MD,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.LG,
    paddingBottom: Spacing.LG,
  },
  groupedCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    overflow: 'hidden',
  },
  envItem: {
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
  },
  envItemActive: {
    backgroundColor: Colors.primaryGhost,
  },
  envItemSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginLeft: 44,
  },
  envRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.MD,
  },
  envInfo: {
    flex: 1,
  },
  envLabel: {
    fontSize: FontSize.LG,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  envHost: {
    fontSize: FontSize.SM,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  checkmark: {
    fontSize: FontSize.LG,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
    marginLeft: Spacing.SM,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  footerInfo: {
    flex: 1,
  },
  footerActiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    marginBottom: 1,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerLabel: {
    fontSize: FontSize.XS,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
  },
  footerValue: {
    fontSize: FontSize.LG,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  resetButton: {
    backgroundColor: Colors.errorDim,
    paddingHorizontal: Spacing.XL,
    paddingVertical: Spacing.SM,
    borderRadius: Radius.LG,
  },
  resetButtonText: {
    color: Colors.error,
    fontSize: FontSize.MD,
    fontWeight: FontWeight.semibold,
  },
});
