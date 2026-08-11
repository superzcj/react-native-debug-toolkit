import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { DebugFeatureRenderProps } from '../../types';
import { Colors } from '../../ui/theme/colors';
import {
  FontSize,
  FontWeight,
  Radius,
  Spacing,
} from '../../ui/theme/layout';
import type {
  QuickAccountItem,
  QuickAccountsFeature,
  QuickAccountsSnapshot,
} from './types';

export function isQuickAccountSwitchDisabled(state: {
  busy: boolean;
  suspended: boolean;
}): boolean {
  return state.busy || state.suspended;
}

export const QuickAccountsTab: React.FC<
  DebugFeatureRenderProps<QuickAccountsSnapshot>
> = React.memo(({ feature }) => {
  const quickAccountsFeature = feature as QuickAccountsFeature<QuickAccountItem>;
  const state = quickAccountsFeature.getViewState();
  const { copy } = state;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{copy.title}</Text>
          {state.contextLabel ? (
            <View style={styles.contextPill}>
              <Text style={styles.contextText}>{state.contextLabel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description}>{copy.description}</Text>
      </View>

      {!state.isAuthenticated ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{copy.unauthenticatedTitle}</Text>
          <Text style={styles.noticeText}>{copy.unauthenticatedDescription}</Text>
        </View>
      ) : null}

      {state.currentAccountDetails.length > 0 ? (
        <View style={styles.detailsCard}>
          <Text style={styles.sectionLabel}>{copy.currentLabel}</Text>
          {state.currentAccountDetails.map((detail) => (
            <View key={`${detail.label}:${detail.value}`} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{detail.label}</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {detail.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {state.lastResult === 'error' && state.errorMessage ? (
        <View style={[styles.resultCard, styles.errorCard]}>
          <Text style={styles.errorText}>{state.errorMessage}</Text>
        </View>
      ) : state.lastResult === 'success' ? (
        <View style={[styles.resultCard, styles.successCard]}>
          <Text style={styles.successText}>{copy.successMessage}</Text>
        </View>
      ) : null}

      {state.accounts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{copy.emptyTitle}</Text>
          <Text style={styles.emptyText}>{copy.emptyDescription}</Text>
        </View>
      ) : (
        <View style={styles.accountsCard}>
          {state.accounts.map((account, index) => {
            const isCurrent = account.id === state.currentAccountId;
            const isLastUsed = account.id === state.lastUsedAccountId;
            const disabled = isQuickAccountSwitchDisabled(state);

            return (
              <Pressable
                key={account.id}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => {
                  quickAccountsFeature
                    .switchAccount(account.id)
                    .catch(() => undefined);
                }}
                style={({ pressed }) => [
                  styles.accountRow,
                  index < state.accounts.length - 1 && styles.accountDivider,
                  pressed && !disabled && styles.accountPressed,
                  disabled && styles.accountDisabled,
                ]}
              >
                <View style={styles.accountBody}>
                  <View style={styles.accountTitleRow}>
                    <Text style={styles.accountLabel} numberOfLines={1}>
                      {account.label}
                    </Text>
                    {isCurrent ? (
                      <View style={styles.currentPill}>
                        <Text style={styles.currentText}>{copy.currentLabel}</Text>
                      </View>
                    ) : isLastUsed ? (
                      <View style={styles.recentPill}>
                        <Text style={styles.recentText}>{copy.lastUsedLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  {account.subtitle ? (
                    <Text style={styles.subtitle}>{account.subtitle}</Text>
                  ) : null}
                  {account.note ? <Text style={styles.note}>{account.note}</Text> : null}
                </View>
                <Text style={styles.actionText}>
                  {state.busy ? copy.switchingLabel : copy.switchLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.LG,
    gap: Spacing.MD,
  },
  intro: {
    gap: Spacing.XS,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.XL,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.MD,
    lineHeight: 19,
  },
  contextPill: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XS,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.primaryGhost,
  },
  contextText: {
    color: Colors.primaryLight,
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
  },
  notice: {
    padding: Spacing.MD,
    gap: Spacing.XS,
    borderRadius: Radius.MD,
    backgroundColor: Colors.surfaceInset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  noticeTitle: {
    color: Colors.text,
    fontSize: FontSize.MD,
    fontWeight: FontWeight.semibold,
  },
  noticeText: {
    color: Colors.textMuted,
    fontSize: FontSize.SM,
  },
  detailsCard: {
    padding: Spacing.MD,
    gap: Spacing.SM,
    borderRadius: Radius.MD,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.XS,
    fontWeight: FontWeight.semibold,
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MD,
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.SM,
    width: 76,
  },
  detailValue: {
    color: Colors.text,
    fontSize: FontSize.SM,
    flex: 1,
  },
  resultCard: {
    padding: Spacing.MD,
    borderRadius: Radius.MD,
  },
  errorCard: {
    backgroundColor: Colors.errorDim,
  },
  successCard: {
    backgroundColor: Colors.successDim,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.SM,
  },
  successText: {
    color: Colors.success,
    fontSize: FontSize.SM,
  },
  emptyCard: {
    alignItems: 'center',
    padding: Spacing.XXL,
    gap: Spacing.SM,
    borderRadius: Radius.MD,
    backgroundColor: Colors.surface,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.LG,
    fontWeight: FontWeight.semibold,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.SM,
    textAlign: 'center',
  },
  accountsCard: {
    borderRadius: Radius.MD,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.MD,
    minHeight: 72,
    padding: Spacing.MD,
  },
  accountDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  accountPressed: {
    backgroundColor: Colors.surfaceHover,
  },
  accountDisabled: {
    opacity: 0.62,
  },
  accountBody: {
    flex: 1,
    gap: Spacing.XS,
  },
  accountTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
  },
  accountLabel: {
    color: Colors.text,
    fontSize: FontSize.MD,
    fontWeight: FontWeight.semibold,
    flexShrink: 1,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.SM,
  },
  note: {
    color: Colors.textMuted,
    fontSize: FontSize.XS,
  },
  actionText: {
    color: Colors.primaryLight,
    fontSize: FontSize.SM,
    fontWeight: FontWeight.semibold,
  },
  currentPill: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XXS,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.successDim,
  },
  currentText: {
    color: Colors.success,
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.semibold,
  },
  recentPill: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XXS,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.primaryGhost,
  },
  recentText: {
    color: Colors.primaryLight,
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.semibold,
  },
});
