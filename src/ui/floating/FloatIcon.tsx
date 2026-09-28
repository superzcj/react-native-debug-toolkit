import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, PanResponder, SafeAreaView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import type { DebugQuickAction } from '../../types/config';
import { t } from '../../i18n';
import { getPreference, persistPreference, KEYS } from '../../utils/debugPreferences';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { QuickActionsMenu } from './QuickActionsMenu';
import { useReducedMotion } from './useReducedMotion';

const EDGE_MARGIN = 16;
const LAUNCHER_SIZE = 48;
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_DISTANCE = 5;
const NO_ACTIONS: readonly DebugQuickAction[] = [];

interface FloatIconProps {
  visible: boolean;
  onPress: () => void;
  badge: { label: string; color: string } | null;
  streaming?: boolean;
  quickActions?: readonly DebugQuickAction[];
}
type GestureDelta = { dx: number; dy: number };
type GestureState = {
  active: boolean;
  moved: boolean;
  longPressed: boolean;
  startedOpen: boolean;
  generation: number;
  positionReady: boolean;
  stopped: { x?: number; y?: number };
  latestDelta: GestureDelta;
  pendingAction?: 'snap';
};

export function FloatIcon({ visible, onPress, badge, streaming, quickActions = NO_ACTIONS }: FloatIconProps) {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState({ width: window.width, height: window.height,
    windowWidth: window.width, windowHeight: window.height });
  const viewport = measured.windowWidth === window.width && measured.windowHeight === window.height
    ? measured : window;
  const minX = Math.min(EDGE_MARGIN, Math.max(0, (viewport.width - LAUNCHER_SIZE) / 2));
  const minY = Math.min(EDGE_MARGIN, Math.max(0, (viewport.height - LAUNCHER_SIZE) / 2));
  const maxX = Math.max(minX, viewport.width - LAUNCHER_SIZE - EDGE_MARGIN);
  const maxY = Math.max(minY, viewport.height - LAUNCHER_SIZE - EDGE_MARGIN);
  const clamp = (point: { x: number; y: number }) => ({
    x: Math.max(minX, Math.min(point.x, maxX)), y: Math.max(minY, Math.min(point.y, maxY)),
  });
  const [origin, setOrigin] = useState(() => clamp({ x: maxX, y: viewport.height * 0.62 }));
  const pan = useRef(new Animated.ValueXY(origin)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lastPosition = useRef(origin);
  const touched = useRef(false);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const gestureGeneration = useRef(0);
  const gesture = useRef<GestureState>({ active: false, moved: false, longPressed: false, startedOpen: false,
    generation: 0, positionReady: true, stopped: {}, latestDelta: { dx: 0, dy: 0 } });
  const menuOpenRef = useRef(false);
  const closing = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const actions = quickActions;

  const cancelTimer = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const closeMenu = useCallback(() => {
    if (!menuOpenRef.current) return;
    closing.current = true;
    menuOpenRef.current = false;
    setMenuOpen(false);
  }, []);
  const onExited = useCallback(() => { closing.current = false; }, []);
  const openMenuAt = (point: { x: number; y: number }) => {
    if (!visible || !actions.length || closing.current) return;
    menuOpenRef.current = true;
    setOrigin(point);
    setMenuOpen(true);
  };
  const openMenu = () => openMenuAt(lastPosition.current);
  const pressScale = (value: number) => {
    scale.stopAnimation();
    if (reduceMotion) scale.setValue(value);
    else Animated.spring(scale, { toValue: value, friction: 8, tension: 160, useNativeDriver: true }).start();
  };
  const snap = (delta: GestureDelta) => {
    const point = clamp({ x: lastPosition.current.x + delta.dx, y: lastPosition.current.y + delta.dy });
    point.x = point.x + LAUNCHER_SIZE / 2 < viewport.width / 2 ? minX : maxX;
    lastPosition.current = point;
    setOrigin(point);
    if (reduceMotion) pan.setValue(point);
    else Animated.spring(pan, { toValue: point, friction: 9, tension: 65, useNativeDriver: true }).start();
    void persistPreference(KEYS.fabPosition, JSON.stringify(point));
  };

  // One responder instance delegates to current closures, including resized bounds.
  const handlers = {
    grant() {
      touched.current = true;
      cancelTimer();
      const current: GestureState = {
        active: visible && !closing.current, moved: false, longPressed: false,
        startedOpen: menuOpenRef.current, generation: ++gestureGeneration.current,
        positionReady: false, stopped: {}, latestDelta: { dx: 0, dy: 0 },
      };
      gesture.current = current;
      if (!current.active) return;

      const retire = () => {
        if (gestureGeneration.current === current.generation) gestureGeneration.current += 1;
        current.generation = -1;
      };
      const resolveStoppedPosition = () => {
        if (!mounted.current || gestureGeneration.current !== current.generation
          || current.stopped.x === undefined || current.stopped.y === undefined) return;
        current.positionReady = true;
        const base = clamp({ x: current.stopped.x, y: current.stopped.y });
        lastPosition.current = base;
        const display = current.moved
          ? clamp({ x: base.x + current.latestDelta.dx, y: base.y + current.latestDelta.dy })
          : base;
        pan.setValue(display);
        if (current.longPressed && !menuOpenRef.current) {
          pressScale(1);
          openMenuAt(display);
        }
        if (current.pendingAction === 'snap') {
          current.pendingAction = undefined;
          snap(current.latestDelta);
        }
        retire();
      };
      const readAxis = (axis: 'x' | 'y') => (value: number) => {
        if (!mounted.current || gestureGeneration.current !== current.generation) return;
        current.stopped[axis] = Number.isFinite(value) ? value : lastPosition.current[axis];
        resolveStoppedPosition();
      };
      // Native-driven animations can report stale ValueXY snapshots. Read each
      // axis and wait for both callbacks before applying a gesture delta.
      pan.x.stopAnimation(readAxis('x'));
      pan.y.stopAnimation(readAxis('y'));
      pressScale(0.94);
      if (!current.startedOpen && actions.length) {
        timer.current = setTimeout(() => {
          if (!mounted.current || gesture.current !== current || !current.active || current.moved) return;
          current.longPressed = true;
          pressScale(1);
          if (current.positionReady) openMenuAt(lastPosition.current);
        }, LONG_PRESS_MS);
      }
    },
    move(delta: GestureDelta) {
      const current = gesture.current;
      if (!current.active || current.startedOpen || current.longPressed) return;
      current.latestDelta = { dx: delta.dx, dy: delta.dy };
      if (Math.hypot(delta.dx, delta.dy) > MOVE_CANCEL_DISTANCE) {
        current.moved = true;
        cancelTimer();
      }
      if (current.moved && current.positionReady) {
        pan.setValue(clamp({ x: lastPosition.current.x + delta.dx, y: lastPosition.current.y + delta.dy }));
      }
    },
    release(delta: GestureDelta, terminated = false) {
      const current = gesture.current;
      cancelTimer();
      pressScale(1);
      if (!current.active) return;
      current.latestDelta = { dx: delta.dx, dy: delta.dy };
      current.active = false;
      if (current.startedOpen) {
        if (!terminated) closeMenu();
        if (!current.positionReady) { current.pendingAction = undefined; }
        if (current.positionReady) gestureGeneration.current += 1;
        return;
      }
      if (current.longPressed) {
        if (terminated) {
          gestureGeneration.current += 1;
          current.longPressed = false;
          closeMenu();
        }
        return;
      }
      if (current.moved || Math.hypot(delta.dx, delta.dy) > MOVE_CANCEL_DISTANCE) {
        current.pendingAction = 'snap';
        if (current.positionReady) {
          current.pendingAction = undefined;
          snap(current.latestDelta);
          gestureGeneration.current += 1;
        }
      } else {
        if (!terminated) onPress();
        gestureGeneration.current += 1;
      }
    },
    clamp,
  };
  const latest = useRef(handlers);
  latest.current = handlers;
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => latest.current.grant(),
    onPanResponderMove: (_event, delta) => latest.current.move(delta),
    onPanResponderRelease: (_event, delta) => latest.current.release(delta),
    onPanResponderTerminate: (_event, delta) => latest.current.release(delta, true),
  }));

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void getPreference(KEYS.fabPosition).then((saved) => {
      if (!active || !saved || touched.current) return;
      try {
        const value = JSON.parse(saved) as { x: number; y: number };
        if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return;
        const point = latest.current.clamp(value);
        lastPosition.current = point;
        pan.setValue(point);
        setOrigin(point);
      } catch { /* Ignore invalid preferences. */ }
    });
    return () => {
      active = false;
      mounted.current = false;
      gestureGeneration.current += 1;
      gesture.current.active = false;
      cancelTimer();
      pan.stopAnimation();
      scale.stopAnimation();
    };
  }, [cancelTimer, pan, scale]);

  useEffect(() => {
    cancelTimer();
    gestureGeneration.current += 1;
    gesture.current.active = false;
    gesture.current.generation = -1;
    menuOpenRef.current = false;
    setMenuOpen(false);
    pan.stopAnimation();
    scale.stopAnimation();
    scale.setValue(1);
    const point = latest.current.clamp(lastPosition.current);
    lastPosition.current = point;
    pan.setValue(point);
    setOrigin(point);
  }, [visible, viewport.width, viewport.height, cancelTimer, pan, scale]);

  const accessibleActivate = () => {
    if (closing.current || !visible) return;
    if (menuOpenRef.current) closeMenu();
    else onPress();
  };
  return (
    <SafeAreaView pointerEvents="box-none" accessibilityViewIsModal={menuOpen} style={StyleSheet.absoluteFillObject}>
      <View pointerEvents="box-none" style={{ flex: 1 }} testID="quick-actions-viewport"
        onLayout={({ nativeEvent: { layout } }) => {
          if (layout.width <= 0 || layout.height <= 0) return;
          setMeasured(previous => previous.width === layout.width && previous.height === layout.height
            && previous.windowWidth === window.width && previous.windowHeight === window.height ? previous
            : { width: layout.width, height: layout.height, windowWidth: window.width, windowHeight: window.height });
        }}>
        <QuickActionsMenu open={menuOpen && visible} active={visible} actions={actions} origin={origin}
          viewport={viewport} onClose={closeMenu} onExited={onExited} reduceMotion={reduceMotion} />
        <Animated.View pointerEvents={visible ? 'auto' : 'none'} testID="debug-toolkit-launcher"
          accessible accessibilityRole="button" accessibilityLabel={menuOpen ? t('quickActions.close') : t('panel.name')}
          accessibilityHint={actions.length ? t('quickActions.hint') : undefined}
          accessibilityActions={actions.length ? [{ name: 'activate' }, { name: 'showQuickActions', label: t('quickActions.open') }] : [{ name: 'activate' }]}
          onAccessibilityTap={accessibleActivate}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'showQuickActions') openMenu();
            else if (nativeEvent.actionName === 'activate') accessibleActivate();
          }}
          style={[styles.root, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }], opacity: visible ? 1 : 0 }]}
          {...responder.panHandlers}>
          <View style={[styles.button, menuOpen && { borderColor: Colors.primaryLight, backgroundColor: Colors.primary }]}>
            <View pointerEvents="none" style={styles.buttonHighlight} />
            {menuOpen ? <View pointerEvents="none" style={styles.closeGlyph}><View style={[styles.closeLine, { transform: [{ rotate: '45deg' }] }]} /><View style={[styles.closeLine, { transform: [{ rotate: '-45deg' }] }]} /></View> : (
              <View style={styles.launcherGlyph}>
                <View style={styles.glyphDot} />
                <View style={styles.glyphLines}><View style={styles.glyphLineLong} /><View style={styles.glyphLineShort} /></View>
              </View>
            )}
            {!menuOpen && <View style={[styles.statusDot, streaming && styles.statusDotLive]} />}
          </View>
          {badge && !menuOpen && <View style={[styles.badge, { backgroundColor: badge.color }]}><Text style={styles.badgeText} numberOfLines={1}>{badge.label}</Text></View>}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', width: LAUNCHER_SIZE, height: LAUNCHER_SIZE, borderRadius: LAUNCHER_SIZE / 2,
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.24, shadowRadius: 12, zIndex: 999,
  },
  button: {
    width: '100%', height: '100%', borderRadius: LAUNCHER_SIZE / 2, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.fabBackground, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  buttonHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 22, backgroundColor: Colors.fabHighlight },
  closeGlyph: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  closeLine: { position: 'absolute', width: 18, height: 2, borderRadius: 1, backgroundColor: Colors.textInverse },
  launcherGlyph: {
    width: 24, height: 24, borderRadius: Radius.SM, borderWidth: 1, borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.XS,
  },
  glyphDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  glyphLines: { gap: 3 },
  glyphLineLong: { width: 10, height: 2, borderRadius: 1, backgroundColor: Colors.textSecondary },
  glyphLineShort: { width: 7, height: 2, borderRadius: 1, backgroundColor: Colors.textMuted },
  statusDot: { position: 'absolute', right: 5, bottom: 5, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: Colors.fabBackground, backgroundColor: Colors.textMuted },
  statusDotLive: { backgroundColor: Colors.success },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 22, maxWidth: 48, height: 18, borderRadius: Radius.Pill, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.background },
  badgeText: { color: Colors.textInverse, fontSize: FontSize.XXS, fontWeight: FontWeight.bold, maxWidth: 38 },
});
