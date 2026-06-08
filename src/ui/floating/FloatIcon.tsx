import React, { useCallback, useEffect, useRef } from 'react';
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
  const minX = EDGE_MARGIN;
  const minY = EDGE_MARGIN;
  const maxX = Math.max(minX, screenWidth - LAUNCHER_SIZE - EDGE_MARGIN);
  const maxY = Math.max(minY, screenHeight - LAUNCHER_SIZE - EDGE_MARGIN);
  const defaultX = maxX;
  const defaultY = Math.max(minY, Math.min(screenHeight * 0.62, maxY));
  const boundsRef = useRef({ minX, minY, maxX, maxY, screenWidth });
  boundsRef.current = { minX, minY, maxX, maxY, screenWidth };
  const clampX = useCallback((value: number) => {
    const { minX: currentMinX, maxX: currentMaxX } = boundsRef.current;
    return Math.max(currentMinX, Math.min(value, currentMaxX));
  }, []);
  const clampY = useCallback((value: number) => {
    const { minY: currentMinY, maxY: currentMaxY } = boundsRef.current;
    return Math.max(currentMinY, Math.min(value, currentMaxY));
  }, []);

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;
  const lastPosition = useRef({ x: defaultX, y: defaultY });

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
  }, [clampX, clampY, pan]);

  useEffect(() => {
    if (!visible) {
      pulse.setValue(0);
      sheen.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sheen, {
          toValue: 1,
          duration: 1700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(1200),
        Animated.timing(sheen, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseLoop.start();
    sheenLoop.start();
    return () => {
      pulseLoop.stop();
      sheenLoop.stop();
    };
  }, [pulse, sheen, visible]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Animated.spring(scale, {
          toValue: 0.94,
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
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();

        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          onPress();
          return;
        }

        const { minX: currentMinX, maxX: currentMaxX, screenWidth: currentScreenWidth } = boundsRef.current;
        const rawX = lastPosition.current.x + gs.dx;
        const snappedX = rawX < currentScreenWidth / 2 - LAUNCHER_SIZE / 2 ? currentMinX : currentMaxX;
        const finalY = clampY(lastPosition.current.y + gs.dy);

        lastPosition.current = { x: snappedX, y: finalY };
        Animated.spring(pan, {
          toValue: { x: snappedX, y: finalY },
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }).start();

        setPreference(KEYS.fabPosition, JSON.stringify({ x: snappedX, y: finalY }));
      },
      onPanResponderTerminate: (_: unknown, gs: { dx: number; dy: number }) => {
        const { minX: currentMinX, maxX: currentMaxX, screenWidth: currentScreenWidth } = boundsRef.current;
        const rawX = lastPosition.current.x + gs.dx;
        const snappedX = rawX < currentScreenWidth / 2 - LAUNCHER_SIZE / 2 ? currentMinX : currentMaxX;
        const finalY = clampY(lastPosition.current.y + gs.dy);
        lastPosition.current = { x: snappedX, y: finalY };
      },
    }),
  ).current;

  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [streaming ? 0.34 : 0.14, streaming ? 0.08 : 0.03],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.28],
  });
  const sheenTranslateX = sheen.interpolate({
    inputRange: [0, 1],
    outputRange: [-34, 34],
  });

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.root,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
          opacity: visible ? 1 : 0,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          { opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
      />
      <Pressable onPress={onPress} style={styles.button}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.buttonHighlight,
            { transform: [{ translateX: sheenTranslateX }, { rotate: '-24deg' }] },
          ]}
        />
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
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText} numberOfLines={1}>{badge.label}</Text>
        </View>
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
  halo: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: (LAUNCHER_SIZE + 10) / 2,
    backgroundColor: Colors.fabGlow,
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
    top: -8,
    bottom: -8,
    left: 2,
    width: 14,
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
