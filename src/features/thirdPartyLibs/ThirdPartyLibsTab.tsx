import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import type { DebugFeatureRenderProps, ThirdPartyLib, ThirdPartyLibAction } from '../../types';

export const ThirdPartyLibsTab: React.FC<DebugFeatureRenderProps<ThirdPartyLib[]>> = ({
  snapshot,
}) => {
  const data = snapshot;
  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No debug libraries available for this platform</Text>
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
  container: { flex: 1, backgroundColor: Colors.surface, padding: 15 },
  empty: { textAlign: 'center', color: Colors.textLight, marginTop: 20 },
  libCard: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  libName: { fontSize: 16, fontWeight: 'bold', color: Colors.text, marginBottom: 4 },
  libDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
