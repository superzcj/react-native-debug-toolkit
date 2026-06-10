import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Text, Pressable, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { getLogItemConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  const [showContent, setShowContent] = useState(initiallyExpanded);
  const [rotationAnim] = useState(() => new Animated.Value(initiallyExpanded ? 1 : 0));
  const tapScale = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(initiallyExpanded ? 1 : 0)).current;
  const reducedMotion = useReduceMotion();
  const logItemConfig = getLogItemConfig(reducedMotion);

  const handlePress = useCallback(() => {
    // Scale pulse feedback
    if (!reducedMotion) {
      Animated.sequence([
        Animated.timing(tapScale, {
          toValue: logItemConfig.tapScale,
          duration: logItemConfig.tapDuration / 2,
          useNativeDriver: true,
        }),
        Animated.timing(tapScale, {
          toValue: 1,
          duration: logItemConfig.tapDuration / 2,
          useNativeDriver: true,
        }),
      ]).start();
    }

    if (expanded) {
      // Collapse: fade content out first, then collapse height
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }).start(() => {
        setShowContent(false);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(false);
      });
    } else {
      // Expand: animate height first, then fade content in
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(true);
      setShowContent(true);
      setTimeout(() => {
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: reducedMotion ? 100 : 150,
          useNativeDriver: true,
        }).start();
      }, logItemConfig.detailFadeDelay);
    }
  }, [expanded, tapScale, contentOpacity, logItemConfig, reducedMotion]);

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
    <Animated.View style={[styles.section, { transform: [{ scale: tapScale }] }]}>
      <Pressable
        style={styles.header}
        onPress={handlePress}
      >
        <Text style={styles.title}>{title}</Text>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotation }] }]}>
          ›
        </Animated.Text>
      </Pressable>
      {expanded && (
        <Animated.View style={[styles.body, { opacity: contentOpacity }]}>
          {showContent && children}
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.MD,
    marginBottom: Spacing.XS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
