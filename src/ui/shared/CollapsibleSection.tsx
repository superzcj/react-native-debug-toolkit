import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme/colors';

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
      duration: 200,
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
    borderRadius: 10,
    marginBottom: 6,
    overflow: 'hidden',
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  chevron: {
    fontSize: 20,
    fontWeight: '500',
    color: Colors.textSecondary,
    width: 20,
    textAlign: 'center',
  },
  body: {
    paddingLeft: 14,
    paddingRight: 14,
    paddingBottom: 12,
  },
});
