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

interface FloatIconProps {
  visible: boolean;
  onPress: () => void;
  badge: { label: string; color: string } | null;
}

export function FloatIcon({ visible, onPress, badge }: FloatIconProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const defaultX = screenWidth - ICON_SIZE - EDGE_MARGIN;
  const defaultY = screenHeight / 2 - ICON_SIZE / 2;

  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPosition = useRef({ x: defaultX, y: defaultY });
  const positionLoaded = useRef(false);

  // Restore saved position
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

        // Snap to nearest edge
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

        // Persist
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
      <Pressable onPress={onPress} style={styles.inner}>
        <View style={styles.iconGrid}>
          <View style={styles.iconRow}>
            <View style={[styles.iconCell, { backgroundColor: Colors.primary }]} />
            <View style={[styles.iconCell, { backgroundColor: Colors.success }]} />
          </View>
          <View style={styles.iconRow}>
            <View style={[styles.iconCell, { backgroundColor: Colors.warning }]} />
            <View style={[styles.iconCell, { backgroundColor: Colors.purple }]} />
          </View>
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.color }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: '#FFFFFF',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  inner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGrid: {
    width: 22,
    height: 22,
    justifyContent: 'space-between',
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconCell: {
    width: 8,
    height: 8,
    borderRadius: 2.5,
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
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700',
  },
});
