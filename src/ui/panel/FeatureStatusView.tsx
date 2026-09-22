import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FeatureStatus } from '../../types/debug';
import { t, type TranslationKey } from '../../i18n';
import { Colors } from '../theme/colors';
import { FontSize, Spacing } from '../theme/layout';

export function FeatureStatusView({ name, status }: { name: string; status: FeatureStatus }) {
  if (status.phase === 'ready') { return null; }
  const hint = `status.hint.${name}` as TranslationKey;
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Text style={styles.title}>{t(`status.${status.phase}` as TranslationKey)}</Text>
      {status.phase === 'empty' && <Text style={styles.message}>{t(hint)}</Text>}
      {status.issues.map((issue, index) => <Text key={`${issue.path}-${index}`} style={styles.message}>{`${issue.path}: ${issue.message}`}</Text>)}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { padding: Spacing.MD, gap: Spacing.XS },
  title: { color: Colors.text, fontSize: FontSize.SM },
  message: { color: Colors.textSecondary, fontSize: FontSize.XS },
});
