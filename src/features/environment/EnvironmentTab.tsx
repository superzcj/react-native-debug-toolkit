import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import type { DebugFeatureRenderProps, EnvironmentListItem, EnvironmentState } from '../../types';
import type { EnvironmentFeatureAPI } from './index';

const DEFAULT_COLORS: Record<string, string> = {
  dev: '#22C55E',
  development: '#22C55E',
  staging: '#F59E0B',
  stage: '#F59E0B',
  production: '#EF4444',
  prod: '#EF4444',
};

const URL_LABELS: Record<string, string> = {
  app: 'App',
  auth: 'Auth',
  crmeb: 'Crmeb',
  h5: 'H5',
  iot: 'IoT',
  shop: 'Shop',
};

export interface EnvironmentUrlRow {
  label: string;
  value: string;
}

function getEnvironmentColor(env: { id: string; color?: string }) {
  return env.color || DEFAULT_COLORS[env.id.toLowerCase()] || Colors.primary;
}

function formatUrlLabel(key: string): string {
  const mapped = URL_LABELS[key.toLowerCase()];
  if (mapped) return mapped;

  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getEnvironmentUrlRows(env: EnvironmentListItem): EnvironmentUrlRow[] {
  if (env.mode === 'managed') {
    const rows = Object.entries(env.urls).map(([key, value]) => ({
      label: formatUrlLabel(key),
      value,
    }));
    return rows.length > 0 ? rows : [{ label: 'URLs', value: 'No URLs configured' }];
  }

  return [{ label: 'Host', value: env.host }];
}

function canResetEnvironment(state: EnvironmentState) {
  return state.mode === 'legacy';
}

export function isDefaultEnvironment(state: EnvironmentState, envId: string): boolean {
  return state.mode === 'managed' && state.defaultEnvironmentId === envId;
}

function showRestartPrompt() {
  Alert.alert(
    'Environment changed',
    'Kill and reopen the app for the new environment to fully take effect.',
    [{ text: 'Got it' }],
  );
}

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
    const nextId = state.mode === 'managed'
      ? envId
      : currentEnvironmentId === envId ? null : envId;

    if (nextId === currentEnvironmentId) {
      return;
    }

    envFeature.switchEnvironment?.(nextId);
    if (state.mode === 'managed') {
      showRestartPrompt();
    }
  };

  const activeEnv = environments.find((e) => e.id === currentEnvironmentId);

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.sectionTitle}>Switch Environment</Text>
        <Text style={styles.sectionDesc}>
          Rewrite API URLs in outgoing requests. Kill and reopen the app after switching.
        </Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <View style={styles.groupedCard}>
          {environments.map((env, index) => {
            const isActive = currentEnvironmentId === env.id;
            const color = getEnvironmentColor(env);
            const urlRows = getEnvironmentUrlRows(env);
            const isDefault = isDefaultEnvironment(state, env.id);

            return (
              <TouchableOpacity
                key={env.id}
                style={[
                  styles.envItem,
                  index < environments.length - 1 && styles.envItemSeparator,
                  isActive && styles.envItemActive,
                ]}
                onPress={() => handleSelect(env.id)}
                activeOpacity={0.7}
              >
                <View style={styles.envItemContent}>
                  <View style={styles.envHeaderRow}>
                    <View style={[styles.colorDot, { backgroundColor: color }]} />
                    <Text style={styles.envLabel} numberOfLines={1}>
                      {env.label}
                    </Text>
                    {isDefault ? (
                      <View style={styles.defaultPill}>
                        <Text style={styles.defaultPillText}>Default</Text>
                      </View>
                    ) : null}
                    {isActive ? (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Active</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.urlList}>
                    {urlRows.map((row) => (
                      <View key={`${env.id}-${row.label}`} style={styles.urlRow}>
                        <Text style={styles.urlKey} numberOfLines={1}>
                          {row.label}
                        </Text>
                        <Text style={styles.urlValue} numberOfLines={1} ellipsizeMode="middle">
                          {row.value}
                        </Text>
                      </View>
                    ))}
                  </View>
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
              <View style={[styles.footerDot, { backgroundColor: getEnvironmentColor(activeEnv) }]} />
              <Text style={styles.footerLabel}>Active</Text>
            </View>
            <Text style={styles.footerValue}>{activeEnv.label}</Text>
            <View style={styles.footerUrlList}>
              {getEnvironmentUrlRows(activeEnv).map((row) => (
                <View key={`footer-${row.label}`} style={styles.footerUrlRow}>
                  <Text style={styles.footerUrlKey} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={styles.footerUrlValue} numberOfLines={1} ellipsizeMode="middle">
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          {canResetEnvironment(state) ? (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => envFeature.switchEnvironment?.(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          ) : null}
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
    borderRadius: Radius.MD,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  envItem: {
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.MD,
  },
  envItemActive: {
    backgroundColor: Colors.primaryGhost,
  },
  envItemSeparator: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  envItemContent: {
    gap: Spacing.SM,
  },
  envHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.SM,
  },
  envLabel: {
    flex: 1,
    fontSize: FontSize.LG,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  defaultPill: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: 3,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.surfaceElevated,
    marginLeft: Spacing.SM,
  },
  defaultPillText: {
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  activePill: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: 3,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.primary,
    marginLeft: Spacing.SM,
  },
  activePillText: {
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
    textTransform: 'uppercase',
  },
  urlList: {
    gap: Spacing.XS,
    paddingLeft: 18,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 18,
  },
  urlKey: {
    width: 48,
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
  },
  urlValue: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.SM,
    color: Colors.textSecondary,
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
  footerUrlList: {
    marginTop: Spacing.SM,
    gap: Spacing.XS,
  },
  footerUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerUrlKey: {
    width: 48,
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
  },
  footerUrlValue: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.SM,
    color: Colors.textSecondary,
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
