import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { getPreference, setPreference, KEYS } from '../../utils/debugPreferences';

const EDGE_MARGIN = 16;
const LAUNCHER_WIDTH = 74;
const LAUNCHER_HEIGHT = 44;
const RING_WIDTH = LAUNCHER_WIDTH + 10;
const RING_HEIGHT = LAUNCHER_HEIGHT + 10;

interface FloatIconProps {
  visible: boolean;
  onPress: () => void;
  badge: { label: string; color: string } | null;
  streaming?: boolean;
}

export function FloatIcon({ visible, onPress, badge, streaming }: FloatIconProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const maxX = screenWidth - LAUNCHER_WIDTH;
  const maxY = screenHeight - LAUNCHER_HEIGHT;
  const defaultX = screenWidth - LAUNCHER_WIDTH - EDGE_MARGIN;
  const defaultY = screenHeight / 2 - LAUNCHER_HEIGHT / 2;

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPosition = useRef({ x: defaultX, y: defaultY });
  const positionLoaded = useRef(false);
  const ringOpacity = useRef(new Animated.Value(0)).current;

  // Streaming ring pulse animation
  useEffect(() => {
    if (!streaming) {
      ringOpacity.setValue(0);
      return;
    }
    ringOpacity.setValue(0.6);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(ringOpacity, {
          toValue: 0.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0.6,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [streaming, ringOpacity]);

  useEffect(() => {
    let mounted = true;
    getPreference(KEYS.fabPosition).then((saved) => {
      if (!mounted || !saved) return;
      try {
        const pos = JSON.parse(saved) as { x: number; y: number };
        const x = Math.max(0, Math.min(pos.x, maxX));
        const y = Math.max(0, Math.min(pos.y, maxY));
        lastPosition.current = { x, y };
        pan.setValue({ x, y });
        positionLoaded.current = true;
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
        Animated.spring(scale, {
          toValue: 0.9,
          friction: 5,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: (_: unknown, gs: { dx: number; dy: number }) => {
        const x = Math.max(
          0,
          Math.min(lastPosition.current.x + gs.dx, maxX),
        );
        const y = Math.max(
          0,
          Math.min(lastPosition.current.y + gs.dy, maxY),
        );
        pan.setValue({ x, y });
      },
      onPanResponderRelease: (_: unknown, gs: { dx: number; dy: number }) => {
        if (Math.abs(gs.dx) < 5 && Math.abs(gs.dy) < 5) {
          Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
          onPress();
          return;
        }
        Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();

        const rawX = lastPosition.current.x + gs.dx;
        const midX = screenWidth / 2 - LAUNCHER_WIDTH / 2;
        const snappedX = rawX < midX ? EDGE_MARGIN : screenWidth - LAUNCHER_WIDTH - EDGE_MARGIN;

        const finalY = Math.max(
          0,
          Math.min(lastPosition.current.y + gs.dy, maxY),
        );

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
        const snappedX =
          lastPosition.current.x + gs.dx < screenWidth / 2 - LAUNCHER_WIDTH / 2
            ? EDGE_MARGIN
            : screenWidth - LAUNCHER_WIDTH - EDGE_MARGIN;
        const finalY = Math.max(
          0,
          Math.min(lastPosition.current.y + gs.dy, maxY),
        );
        lastPosition.current = { x: snappedX, y: finalY };
      },
    }),
  ).current;

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
        style={[
          styles.streamingRing,
          { opacity: ringOpacity },
        ]}
        pointerEvents="none"
      />

      <Pressable onPress={onPress} style={styles.inner}>
        <View style={styles.mark}>
          <View style={styles.markDot} />
          <View style={styles.markLine} />
        </View>
        <Text style={styles.label}>DT</Text>
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
    width: LAUNCHER_WIDTH,
    height: LAUNCHER_HEIGHT,
    borderRadius: LAUNCHER_HEIGHT / 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
  },
  streamingRing: {
    position: 'absolute',
    top: -(RING_HEIGHT - LAUNCHER_HEIGHT) / 2,
    left: -(RING_WIDTH - LAUNCHER_WIDTH) / 2,
    width: RING_WIDTH,
    height: RING_HEIGHT,
    borderRadius: RING_HEIGHT / 2,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  inner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.SM,
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.primaryDim,
    backgroundColor: Colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  markDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  markLine: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
  label: {
    color: Colors.text,
    fontSize: FontSize.SM,
    fontWeight: FontWeight.bold,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  statusDotLive: {
    backgroundColor: Colors.success,
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -8,
    minWidth: 24,
    maxWidth: 54,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surface,
    elevation: 4,
  },
  badgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: FontWeight.bold,
    maxWidth: 44,
  },
});
