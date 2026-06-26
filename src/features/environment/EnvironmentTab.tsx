import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
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

export type EnvironmentFooterAction = 'restore' | 'reset';

export function getEnvironmentFooterAction(state: EnvironmentState): EnvironmentFooterAction | null {
  if (state.mode === 'managed' && state.currentEnvironmentId != null) {
    return 'restore';
  }

  if (canResetEnvironment(state) && state.currentEnvironmentId != null) {
    return 'reset';
  }

  return null;
}

export function isDefaultEnvironment(state: EnvironmentState, envId: string): boolean {
  return state.mode === 'managed' && state.defaultEnvironmentId === envId;
}

export function getDefaultEnvironment(state: EnvironmentState): EnvironmentListItem | null {
  if (state.mode !== 'managed' || !state.defaultEnvironmentId) {
    return null;
  }

  return state.environments.find((env) => env.id === state.defaultEnvironmentId) ?? null;
}

export function getDisplayEnvironment(state: EnvironmentState): EnvironmentListItem | null {
  const active = state.environments.find((env) => env.id === state.currentEnvironmentId);
  if (active) return active;

  return getDefaultEnvironment(state);
}

export function shouldShowRestartBlocker(state: EnvironmentState): boolean {
  return state.mode === 'managed' && state.restartRequired;
}

function confirmEnvironmentSwitch(env: EnvironmentListItem, onConfirm: () => void) {
  Alert.alert(
    'Switch environment?',
    `Save "${env.label}" as the active environment? You must kill and reopen the app after saving.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', style: 'destructive', onPress: onConfirm },
    ],
  );
}

function confirmRestoreDefault(onConfirm: () => void) {
  Alert.alert(
    'Restore default URLs?',
    'This removes the saved environment switch and returns requests to the app default URLs. You must kill and reopen the app after saving.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', style: 'destructive', onPress: onConfirm },
    ],
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
  const footerAction = getEnvironmentFooterAction(state);

  const applyManagedEnvironment = async (envId: string) => {
    await envFeature.switchEnvironment?.(envId);
  };

  const handleSelect = (env: EnvironmentListItem) => {
    const envId = env.id;
    const nextId = state.mode === 'managed'
      ? envId
      : currentEnvironmentId === envId ? null : envId;

    if (nextId === currentEnvironmentId) {
      return;
    }

    if (state.mode === 'managed') {
      confirmEnvironmentSwitch(env, () => {
        void applyManagedEnvironment(envId);
      });
      return;
    }

    envFeature.switchEnvironment?.(nextId);
  };

  const handleRestoreDefault = () => {
    if (state.mode !== 'managed' || currentEnvironmentId == null) {
      return;
    }

    confirmRestoreDefault(() => {
      void (async () => {
        await envFeature.restoreDefaultEnvironment?.();
      })();
    });
  };

  const defaultEnv = getDefaultEnvironment(state);
  const showRestartWarning = shouldShowRestartBlocker(state);

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.sectionTitle}>Switch Environment</Text>
        <Text style={styles.sectionDesc}>
          Save a debug environment only when you are ready to restart the app.
        </Text>
        {showRestartWarning ? (
          <View style={styles.restartWarning}>
            <Text style={styles.restartWarningTitle}>Restart required</Text>
            <Text style={styles.restartWarningText}>
              Kill and reopen the app after changing or restoring environment settings.
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {defaultEnv ? (
          <View style={styles.defaultSection}>
            <Text style={styles.listSectionTitle}>Built-in URLs</Text>
            <View style={styles.builtInCard}>
              <View style={styles.builtInHeaderRow}>
                <View style={[styles.colorDot, { backgroundColor: getEnvironmentColor(defaultEnv) }]} />
                <View style={styles.builtInTitleGroup}>
                  <Text style={styles.builtInKicker}>Current app default</Text>
                  <Text style={styles.builtInLabel} numberOfLines={1}>
                    {defaultEnv.label}
                  </Text>
                </View>
                <View style={styles.defaultPill}>
                  <Text style={styles.defaultPillText}>Default</Text>
                </View>
              </View>
              <View style={styles.builtInUrlList}>
                {getEnvironmentUrlRows(defaultEnv).map((row) => (
                  <View key={`default-${row.label}`} style={styles.urlRow}>
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
          </View>
        ) : null}

        {state.mode === 'managed' ? (
          <Text style={styles.listSectionTitle}>Switch To</Text>
        ) : null}
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
                onPress={() => handleSelect(env)}
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

      {footerAction ? (
        <View style={styles.footer}>
          {footerAction === 'restore' ? (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleRestoreDefault}
              activeOpacity={0.7}
            >
              <Text style={styles.resetButtonText}>Restore default</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => {
                void envFeature.switchEnvironment?.(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
      <Modal
        visible={showRestartWarning}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.blockerBackdrop}>
          <View style={styles.blockerCard}>
            <Text style={styles.blockerTitle}>Kill app now</Text>
            <Text style={styles.blockerText}>
              Environment settings were saved. Kill this app and reopen it before using any other debug tools.
            </Text>
            <Text style={styles.blockerHint}>No in-app dismiss. Restart required.</Text>
          </View>
        </View>
      </Modal>
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
  restartWarning: {
    marginTop: Spacing.MD,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    borderRadius: Radius.MD,
    backgroundColor: Colors.warningDim,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  restartWarningTitle: {
    fontSize: FontSize.SM,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
    textTransform: 'uppercase',
    marginBottom: Spacing.XXS,
  },
  restartWarningText: {
    fontSize: FontSize.SM,
    color: Colors.textSecondary,
    lineHeight: 17,
  },

  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.LG,
    paddingBottom: Spacing.LG,
  },
  defaultSection: {
    marginBottom: Spacing.LG,
  },
  listSectionTitle: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: Spacing.SM,
  },
  builtInCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.MD,
  },
  builtInHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
  },
  builtInTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  builtInKicker: {
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  builtInLabel: {
    fontSize: FontSize.LG,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  builtInUrlList: {
    gap: Spacing.XS,
    paddingLeft: 18,
    marginTop: Spacing.SM,
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
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
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
  blockerBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.XL,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  blockerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.XL,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.XL,
    paddingVertical: Spacing.XL,
  },
  blockerTitle: {
    fontSize: FontSize.XL,
    fontWeight: FontWeight.bold,
    color: Colors.error,
    textTransform: 'uppercase',
    marginBottom: Spacing.MD,
  },
  blockerText: {
    fontSize: FontSize.MD,
    color: Colors.text,
    lineHeight: 20,
  },
  blockerHint: {
    marginTop: Spacing.MD,
    fontSize: FontSize.SM,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
});
