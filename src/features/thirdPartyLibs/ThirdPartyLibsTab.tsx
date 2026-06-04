import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import type { DebugFeatureRenderProps, ThirdPartyLib, ThirdPartyLibAction } from '../../types';

export const ThirdPartyLibsTab: React.FC<DebugFeatureRenderProps<ThirdPartyLib[]>> = ({
  snapshot,
}) => {
  const data = snapshot;
  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>No debug libraries available for this platform</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {data.map((lib) => (
        <View key={lib.id} style={styles.libCard}>
          <Text style={styles.libName}>{lib.name}</Text>
          <Text style={styles.libDesc}>{lib.description}</Text>
          <View style={styles.actions}>
            {lib.actions.map((action: ThirdPartyLibAction) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionButton}
                onPress={action.onPress}
              >
                <Text style={styles.actionText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.MD },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.SM },
  libCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    padding: Spacing.MD,
    marginBottom: Spacing.SM,
  },
  libName: { fontSize: FontSize.LG, fontWeight: FontWeight.bold, color: Colors.text, marginBottom: Spacing.XXS },
  libDesc: { fontSize: FontSize.SM, color: Colors.textSecondary, marginBottom: Spacing.MD },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.XS,
    borderRadius: Radius.SM,
    marginRight: Spacing.SM,
    marginBottom: Spacing.SM,
  },
  actionText: { color: Colors.textInverse, fontSize: FontSize.MD, fontWeight: FontWeight.semibold },
});
