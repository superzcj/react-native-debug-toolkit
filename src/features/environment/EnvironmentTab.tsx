import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import type { DebugFeatureRenderProps } from '../../types/feature';
import type { DebugEnvironment, EnvironmentState } from '../../types/environment';
import type { EnvironmentFeatureAPI } from './index';
import { t } from '../../i18n';

export interface EnvironmentUrlRow { label: string; value: string }
export function getEnvironmentUrlRows(env: DebugEnvironment): EnvironmentUrlRow[] {
  const labels: Record<string, string> = { app: 'App', auth: 'Auth', crmeb: 'Crmeb', h5: 'H5', iot: 'IoT', shop: 'Shop' };
  return Object.entries(env.urls).map(([key, value]) => ({
    label: labels[key.toLowerCase()] ?? key.split(/[-_\s]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    value,
  }));
}
export function getEnvironmentFooterAction(state: EnvironmentState): 'restore' | null {
  return !state.busy && state.currentEnvironmentId && state.currentEnvironmentId !== state.defaultEnvironmentId ? 'restore' : null;
}
export function isDefaultEnvironment(state: EnvironmentState, id: string): boolean { return state.defaultEnvironmentId === id; }
export function getDefaultEnvironment(state: EnvironmentState): DebugEnvironment | null {
  return state.environments.find(env => env.id === state.defaultEnvironmentId) ?? null;
}
export function getDisplayEnvironment(state: EnvironmentState): DebugEnvironment | null {
  return state.environments.find(env => env.id === state.currentEnvironmentId) ?? getDefaultEnvironment(state);
}

export const EnvironmentTab: React.FC<DebugFeatureRenderProps<EnvironmentState>> = React.memo(({ snapshot: state, feature }) => {
  const environment = feature as EnvironmentFeatureAPI;
  if (!state?.environments.length) {
    return <View style={styles.container}><View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>⚙</Text>
      <Text style={styles.emptyTitle}>{t('environment.noEnvironments')}</Text>
      {state?.error ? <Text style={styles.emptyDesc}>{state.error}</Text> : null}
    </View></View>;
  }
  return <View style={styles.container}>
    <View style={styles.headerSection}>
      <Text style={styles.sectionTitle}>{t('environment.switch')}</Text>
      {state.error ? <Text accessibilityRole="alert" style={styles.restartWarningText}>{state.error}</Text> : null}
    </View>
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      <View style={styles.groupedCard}>{state.environments.map((env, index) =>
        <TouchableOpacity key={env.id} disabled={state.busy}
          accessibilityState={{ disabled: state.busy, selected: env.id === state.currentEnvironmentId, busy: state.busy }}
          onPress={async () => { await environment.switchEnvironment(env.id); }}
          style={[styles.envItem, index < state.environments.length - 1 && styles.envItemSeparator, env.id === state.currentEnvironmentId && styles.envItemActive]}>
          <View style={styles.envItemContent}>
            <View style={styles.envHeaderRow}>
              <Text style={styles.envLabel}>{env.title}</Text>
              {isDefaultEnvironment(state, env.id) ? <Text style={styles.defaultPillText}>{t('common.default')}</Text> : null}
              {env.id === state.currentEnvironmentId ? <Text style={styles.activePillText}>{t('common.active')}</Text> : null}
            </View>
            <View style={styles.urlList}>{getEnvironmentUrlRows(env).map(row =>
              <View key={row.label} style={styles.urlRow}><Text style={styles.urlKey}>{row.label}</Text><Text style={styles.urlValue}>{row.value}</Text></View>,
            )}</View>
          </View>
        </TouchableOpacity>,
      )}</View>
    </ScrollView>
    {getEnvironmentFooterAction(state) ? <View style={styles.footer}>
      <TouchableOpacity style={styles.resetButton} onPress={async () => { await environment.restoreDefaultEnvironment(); }}>
        <Text style={styles.resetButtonText}>{t('common.restoreDefault')}</Text>
      </TouchableOpacity>
    </View> : null}
  </View>;
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
