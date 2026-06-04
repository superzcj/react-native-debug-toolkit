import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';

interface Props {
  title: string;
  initiallyExpanded?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<Props> = ({
  title,
  initiallyExpanded = false,
  children,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [rotationAnim] = useState(() => new Animated.Value(initiallyExpanded ? 1 : 0));

  useEffect(() => {
    Animated.timing(rotationAnim, {
      toValue: expanded ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [expanded, rotationAnim]);

  const chevronRotation = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.title}>{title}</Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotation }] }]}>
          ›
        </Animated.Text>
      </Pressable>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    marginBottom: Spacing.XS,
    overflow: 'hidden',
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
  },
  title: {
    fontSize: FontSize.MD,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  chevron: {
    fontSize: 18,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
    width: 20,
    textAlign: 'center',
  },
  body: {
    paddingLeft: Spacing.LG,
    paddingRight: Spacing.LG,
    paddingBottom: Spacing.MD,
  },
});
