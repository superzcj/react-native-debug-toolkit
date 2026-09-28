import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, BackHandler, Easing, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import type { DebugQuickAction } from '../../types/config';
import { t } from '../../i18n';
import { Colors } from '../theme/colors';
import { layoutRadialActions } from './radialActions';

interface QuickActionsMenuProps {
  open: boolean;
  active: boolean;
  actions: readonly DebugQuickAction[];
  origin: { x: number; y: number };
  viewport: { width: number; height: number };
  onClose: () => void;
  onExited: () => void;
  reduceMotion: boolean;
}
interface Feedback { id: string; title: string; message: string; success: boolean }

export function QuickActionsMenu({ open, active, actions, origin, viewport, onClose, onExited, reduceMotion }: QuickActionsMenuProps) {
  const mounted = useRef(false);
  const [present, setPresent] = useState(open);
  const values = useMemo(() => Array.from({ length: actions.length }, () => new Animated.Value(0)), [actions.length]);
  const backdrop = useRef(new Animated.Value(0)).current;
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const current = useRef({ active, open });
  current.current = { active, open };
  const layout = useMemo(() => layoutRadialActions({
    origin: { x: origin.x, y: origin.y },
    viewport: { width: viewport.width, height: viewport.height }, count: actions.length,
  }),
    [origin.x, origin.y, viewport.width, viewport.height, actions.length]);
  const grid = layout[0]?.mode === 'grid';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current = null; };
  }, []);

  useEffect(() => {
    if (open && active) setPresent(true);
    const entering = open && active;
    const finish = () => { if (mounted.current && !entering) setPresent(false); };
    if (reduceMotion || !active) {
      backdrop.setValue(entering ? 1 : 0);
      values.forEach(value => value.setValue(entering ? 1 : 0));
      finish();
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(backdrop, { toValue: entering ? 1 : 0, duration: entering ? 180 : 160, useNativeDriver: true }),
      ...values.map((value, index) => Animated.timing(value, {
        toValue: entering ? 1 : 0, duration: entering ? 240 : 160, delay: entering ? index * 20 : 0,
        easing: entering ? Easing.bezier(0.2, 0.9, 0.25, 1.06) : Easing.out(Easing.cubic),
        useNativeDriver: true,
      })),
    ]);
    animation.start(({ finished }) => { if (finished) finish(); });
    return () => animation.stop();
  }, [open, active, reduceMotion, values, backdrop]);

  // Flush only after the closing layer has been removed in a committed render.
  useEffect(() => {
    if (present || open) return;
    onExited();
    const invoke = pending.current;
    pending.current = null;
    invoke?.();
  }, [present, open, onExited]);

  useEffect(() => {
    if (!open || !active) return;
    const subscription = BackHandler?.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription?.remove();
  }, [open, active, onClose]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const run = useCallback((action: DebugQuickAction) => {
    if (!current.current.active || !current.current.open || action.disabled || pending.current || busyRef.current.has(action.id)) return;
    busyRef.current.add(action.id);
    setBusy(new Set(busyRef.current));
    setFeedback(null);
    const invoke = () => {
      if (!mounted.current) return;
      void Promise.resolve().then(() => action.onPress()).then(() => {
        if (mounted.current) setFeedback({ id: action.id, title: action.title, message: t('quickActions.success'), success: true });
      }, (error: unknown) => {
        const detail = error instanceof Error ? error.message.slice(0, 160) : '';
        if (mounted.current) setFeedback({ id: action.id, title: action.title,
          message: detail ? t('quickActions.error') + ': ' + detail : t('quickActions.error'), success: false });
      }).finally(() => {
        busyRef.current.delete(action.id);
        if (mounted.current) setBusy(new Set(busyRef.current));
      });
    };
    if (action.closeOnPress !== false) {
      pending.current = invoke;
      onClose();
    } else invoke();
  }, [onClose]);

  const cards = actions.map((action, index) => {
    const card = layout[index];
    if (!card) return null;
    const progress = values[index]!;
    const icon = typeof action.icon === 'string' || typeof action.icon === 'number'
      ? <Text style={styles.iconText}>{action.icon}</Text> : action.icon;
    const isBusy = busy.has(action.id);
    const success = feedback?.id === action.id && feedback.success;
    return (
      <Animated.View key={action.id} testID={'quick-action-card-' + action.id}
        style={[styles.position, { left: card.left, top: card.top, width: card.width, height: card.height,
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
          transform: reduceMotion ? [] : [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: grid ? [0, 0] : [origin.x + 24 - card.centerX, 0] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: grid ? [6, 0] : [origin.y + 24 - card.centerY, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }) },
          ],
        }]}>
        <Pressable testID={'quick-action-' + action.id} accessibilityRole="button" accessibilityLabel={action.title}
          accessibilityState={{ disabled: !!action.disabled || isBusy, busy: isBusy }}
          disabled={!!action.disabled || isBusy} onPress={() => run(action)}
          style={({ pressed }) => [styles.hitTarget, action.disabled && styles.disabled, pressed && styles.pressed]}>
          <View style={[styles.orb, success && styles.successOrb]}>
            {isBusy ? <ActivityIndicator testID={'quick-action-spinner-' + action.id} color={Colors.primaryLight} size="small" />
              : success ? <Text style={styles.iconText}>✓</Text>
              : icon ?? <Text style={styles.iconText}>{action.title.slice(0, 1)}</Text>}
          </View>
          <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.3}
            style={[styles.label, { opacity: progress.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' }) }]}>
            {action.title}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    );
  });
  const showLayer = active && (open || present) && actions.length > 0;
  return (
    <>
      <View testID="quick-actions-menu" pointerEvents={showLayer ? 'box-none' : 'none'}
        accessibilityElementsHidden={!open || !active} importantForAccessibility={open && active ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, grid && { zIndex: 1000 }]}>
        {showLayer && (
          <>
            <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
              <Pressable testID="quick-actions-backdrop" accessibilityRole="button" accessibilityLabel={t('quickActions.close')}
                style={StyleSheet.absoluteFillObject} onPress={onClose} />
            </Animated.View>
            {grid ? (
              <View style={styles.gridPanel} accessibilityViewIsModal>
                <Pressable accessibilityRole="button" accessibilityLabel={t('quickActions.close')} style={styles.gridClose} onPress={onClose}>
                  <Text style={styles.closeText}>{t('quickActions.close')} ×</Text>
                </Pressable>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ height: Math.max(viewport.height - 44, ...layout.map(card => card.bottom), 0) + 8 }}>
                  <Pressable testID="quick-actions-grid-backdrop" accessible={false}
                    style={StyleSheet.absoluteFillObject} onPress={onClose} />
                  {cards}
                </ScrollView>
              </View>
            ) : <View pointerEvents={open ? 'box-none' : 'none'} style={StyleSheet.absoluteFillObject}>{cards}</View>}
          </>
        )}
      </View>
      {feedback && active && (
        <View pointerEvents="none" testID="quick-action-feedback" style={styles.feedback} accessibilityLiveRegion="polite">
          <Text style={[styles.feedbackText, !feedback.success && { borderColor: Colors.error }]} numberOfLines={3}>
            {feedback.title + ' · ' + feedback.message}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 998 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,16,24,0.24)' },
  position: { position: 'absolute' },
  hitTarget: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2, gap: 6 },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.8 },
  disabled: { opacity: 0.4 },
  orb: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: Colors.chromeBorder,
    backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 8, elevation: 8 },
  successOrb: { borderColor: Colors.success },
  iconText: { color: Colors.primaryLight, fontSize: 20, lineHeight: 25 },
  label: { maxWidth: 72, color: Colors.text, backgroundColor: Colors.fabBackground, borderRadius: 5,
    paddingHorizontal: 4, paddingVertical: 2, fontSize: 11, lineHeight: 14, fontWeight: '500', textAlign: 'center', overflow: 'hidden' },
  feedback: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 1001 },
  feedbackText: { color: Colors.text, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 12 },
  gridPanel: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background },
  gridClose: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  closeText: { color: Colors.primaryLight, fontSize: 12 },
});
