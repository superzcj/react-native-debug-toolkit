import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors } from '../../ui/theme/colors';
import type { DebugFeatureRenderProps, EnvironmentState } from '../../types';
import type { EnvironmentFeatureAPI } from './index';

const DEFAULT_COLORS: Record<string, string> = {
  dev: '#34C759',
  development: '#34C759',
  staging: '#FF9500',
  stage: '#FF9500',
  production: '#FF3B30',
  prod: '#FF3B30',
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

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyIcon: {
    fontSize: 36,
    color: Colors.textLight,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: Colors.primary,
  },

  // Header
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // Grouped list (iOS Settings style)
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  groupedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  envItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  envItemActive: {
    backgroundColor: 'rgba(0,122,255,0.03)',
  },
  envItemSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginLeft: 48,
  },
  envRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 14,
  },
  envInfo: {
    flex: 1,
  },
  envLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.text,
  },
  envHost: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
    marginLeft: 8,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerInfo: {
    flex: 1,
  },
  footerActiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  footerValue: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  resetButton: {
    backgroundColor: 'rgba(255,59,48,0.08)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  resetButtonText: {
    color: Colors.error,
    fontSize: 15,
    fontWeight: '600',
  },
});
