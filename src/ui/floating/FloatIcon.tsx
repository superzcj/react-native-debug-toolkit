import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { getPreference, setPreference, KEYS } from '../../utils/debugPreferences';
import { getFabConfig, getBadgeConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

const EDGE_MARGIN = 16;
const LAUNCHER_SIZE = 48;

interface FloatIconProps {
  visible: boolean;
  onPress: () => void;
  badge: { label: string; color: string } | null;
  streaming?: boolean;
}

export function FloatIcon({ visible, onPress, badge, streaming }: FloatIconProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReduceMotion();
  const fabConfig = getFabConfig(reducedMotion);
  const badgeConfig = getBadgeConfig();
  const minX = EDGE_MARGIN;
  const minY = EDGE_MARGIN;
  const maxX = Math.max(minX, screenWidth - LAUNCHER_SIZE - EDGE_MARGIN);
  const maxY = Math.max(minY, screenHeight - LAUNCHER_SIZE - EDGE_MARGIN);
  const defaultX = maxX;
  const defaultY = Math.max(minY, Math.min(screenHeight * 0.62, maxY));
  const clampX = (value: number) => Math.max(minX, Math.min(value, maxX));
  const clampY = (value: number) => Math.max(minY, Math.min(value, maxY));

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const breathScale = useRef(new Animated.Value(1)).current;
  const badgeScale = useRef(new Animated.Value(1)).current;
  const lastPosition = useRef({ x: defaultX, y: defaultY });
  const prevVisible = useRef(visible);
  const prevBadgeLabel = useRef(badge?.label ?? null);
  const breathingRef = useRef<Animated.CompositeAnimation | null>(null);
  const isTouching = useRef(false);

  // Scale-down micro-interaction when panel opens
  useEffect(() => {
    if (prevVisible.current && !visible) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.7,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!prevVisible.current && visible) {
      scale.setValue(0);
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
    prevVisible.current = visible;
  }, [visible, scale]);

  // T011: Breathing pulse animation when idle and visible
  useEffect(() => {
    if (!visible || !fabConfig.useBreathing || reducedMotion) {
      if (breathingRef.current) {
        breathingRef.current.stop();
        breathingRef.current = null;
      }
      breathScale.setValue(1);
      return;
    }

    if (isTouching.current) return;

    const breathAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, {
          toValue: fabConfig.breathScaleMin,
          duration: fabConfig.breathDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathScale, {
          toValue: 1,
          duration: fabConfig.breathDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    breathingRef.current = breathAnim;
    breathAnim.start();

    return () => {
      if (breathingRef.current) {
        breathingRef.current.stop();
        breathingRef.current = null;
      }
    };
  }, [visible, fabConfig, breathScale, reducedMotion]);

  // T012: Badge count bounce on change
  useEffect(() => {
    const currentLabel = badge?.label ?? null;
    if (prevBadgeLabel.current !== null && currentLabel !== null && currentLabel !== prevBadgeLabel.current) {
      Animated.sequence([
        Animated.spring(badgeScale, {
          toValue: badgeConfig.bounceScale,
          tension: badgeConfig.tension,
          friction: badgeConfig.friction,
          useNativeDriver: true,
        }),
        Animated.spring(badgeScale, {
          toValue: 1,
          tension: 200,
          friction: 4,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevBadgeLabel.current = currentLabel;
  }, [badge?.label, badgeScale, badgeConfig]);

  useEffect(() => {
    let mounted = true;
    getPreference(KEYS.fabPosition).then((saved) => {
      if (!mounted || !saved) return;
      try {
        const pos = JSON.parse(saved) as { x: number; y: number };
        const x = clampX(pos.x);
        const y = clampY(pos.y);
        lastPosition.current = { x, y };
        pan.setValue({ x, y });
      } catch {
        // ignore bad data
      }
    });
    return () => { mounted = false; };
  }, [maxX, maxY, pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isTouching.current = true;
        if (breathingRef.current) {
          breathingRef.current.stop();
          breathingRef.current = null;
        }
        breathScale.setValue(1);
        Animated.spring(scale, {
          toValue: fabConfig.pressScale,
          friction: 5,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (_: unknown, gs: { dx: number; dy: number }) => {
        pan.setValue({
          x: clampX(lastPosition.current.x + gs.dx),
          y: clampY(lastPosition.current.y + gs.dy),
        });
      },
      onPanResponderRelease: (_: unknown, gs: { dx: number; dy: number }) => {
        isTouching.current = false;
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();

        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          onPress();
          return;
        }

        const rawX = lastPosition.current.x + gs.dx;
        const snappedX = rawX < screenWidth / 2 - LAUNCHER_SIZE / 2 ? minX : maxX;
        const finalY = clampY(lastPosition.current.y + gs.dy);

        lastPosition.current = { x: snappedX, y: finalY };
        Animated.spring(pan, {
          toValue: { x: snappedX, y: finalY },
          friction: fabConfig.edgeSnapFriction,
          tension: fabConfig.edgeSnapTension,
          useNativeDriver: true,
        }).start();

        setPreference(KEYS.fabPosition, JSON.stringify({ x: snappedX, y: finalY }));
      },
      onPanResponderTerminate: (_: unknown, gs: { dx: number; dy: number }) => {
        isTouching.current = false;
        const rawX = lastPosition.current.x + gs.dx;
        const snappedX = rawX < screenWidth / 2 - LAUNCHER_SIZE / 2 ? minX : maxX;
        const finalY = clampY(lastPosition.current.y + gs.dy);
        lastPosition.current = { x: snappedX, y: finalY };
      },
    }),
  ).current;

  // Combined scale: breathScale * scale (multiply for simultaneous animations)
  const combinedScale = Animated.multiply(scale, breathScale);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.root,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: combinedScale }],
          opacity: visible ? 1 : 0,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable onPress={onPress} style={styles.button}>
        <View pointerEvents="none" style={styles.buttonHighlight} />
        <View style={styles.launcherGlyph}>
          <View style={styles.glyphDot} />
          <View style={styles.glyphLines}>
            <View style={styles.glyphLineLong} />
            <View style={styles.glyphLineShort} />
          </View>
        </View>
        <View style={[styles.statusDot, streaming && styles.statusDotLive]} />
      </Pressable>
      {badge && (
        <Animated.View style={[styles.badge, { backgroundColor: badge.color, transform: [{ scale: badgeScale }] }]}>
          <Text style={styles.badgeText} numberOfLines={1}>{badge.label}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    width: LAUNCHER_SIZE,
    height: LAUNCHER_SIZE,
    borderRadius: LAUNCHER_SIZE / 2,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
  button: {
    width: '100%',
    height: '100%',
    borderRadius: LAUNCHER_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.fabBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: Colors.fabHighlight,
  },
  launcherGlyph: {
    width: 24,
    height: 24,
    borderRadius: Radius.SM,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.XS,
  },
  glyphDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  glyphLines: {
    gap: 3,
  },
  glyphLineLong: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.textSecondary,
  },
  glyphLineShort: {
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.textMuted,
  },
  statusDot: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: Colors.fabBackground,
    backgroundColor: Colors.textMuted,
  },
  statusDotLive: {
    backgroundColor: Colors.success,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 22,
    maxWidth: 48,
    height: 18,
    borderRadius: Radius.Pill,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.background,
  },
  badgeText: {
    color: Colors.textInverse,
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.bold,
    maxWidth: 38,
  },
});
