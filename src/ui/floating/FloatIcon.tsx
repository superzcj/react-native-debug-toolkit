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
import { ICON_SIZE } from '../theme/layout';
import { getPreference, setPreference, KEYS } from '../../utils/debugPreferences';

const EDGE_MARGIN = 16;
const RING_SIZE = ICON_SIZE + 12;

interface FloatIconProps {
  visible: boolean;
  onPress: () => void;
  badge: { label: string; color: string } | null;
  streaming?: boolean;
}

export function FloatIcon({ visible, onPress, badge, streaming }: FloatIconProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const defaultX = screenWidth - ICON_SIZE - EDGE_MARGIN;
  const defaultY = screenHeight / 2 - ICON_SIZE / 2;

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
        const x = Math.max(0, Math.min(pos.x, screenWidth - ICON_SIZE));
        const y = Math.max(0, Math.min(pos.y, screenHeight - ICON_SIZE));
        lastPosition.current = { x, y };
        pan.setValue({ x, y });
        positionLoaded.current = true;
      } catch {
        // ignore bad data
      }
    });
    return () => { mounted = false; };
  }, [screenWidth, screenHeight, pan]);

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
          Math.min(lastPosition.current.x + gs.dx, screenWidth - ICON_SIZE),
        );
        const y = Math.max(
          0,
          Math.min(lastPosition.current.y + gs.dy, screenHeight - ICON_SIZE),
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
        const midX = screenWidth / 2 - ICON_SIZE / 2;
        const snappedX = rawX < midX ? EDGE_MARGIN : screenWidth - ICON_SIZE - EDGE_MARGIN;

        const finalY = Math.max(
          0,
          Math.min(lastPosition.current.y + gs.dy, screenHeight - ICON_SIZE),
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
          lastPosition.current.x + gs.dx < screenWidth / 2 - ICON_SIZE / 2
            ? EDGE_MARGIN
            : screenWidth - ICON_SIZE - EDGE_MARGIN;
        const finalY = Math.max(
          0,
          Math.min(lastPosition.current.y + gs.dy, screenHeight - ICON_SIZE),
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
      {/* Streaming ring */}
      <Animated.View
        style={[
          styles.streamingRing,
          { opacity: ringOpacity },
        ]}
        pointerEvents="none"
      />

      <Pressable onPress={onPress} style={styles.inner}>
        {/* Crosshair icon — horizontal bar */}
        <View style={styles.crosshairH} />
        {/* Crosshair icon — vertical bar */}
        <View style={styles.crosshairV} />
      </Pressable>

      {badge && (
        <View style={[styles.badge, { backgroundColor: badge.color }]}>
          <Text style={styles.badgeText}>{badge.label}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  streamingRing: {
    position: 'absolute',
    top: -(RING_SIZE - ICON_SIZE) / 2,
    left: -(RING_SIZE - ICON_SIZE) / 2,
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  inner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 20,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.surface,
    elevation: 4,
  },
  badgeText: {
    color: Colors.textInverse,
    fontSize: 9,
    fontWeight: '700',
  },
});
