import React, { useCallback, useEffect, useRef } from 'react';
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
import { getPanelConfig } from '../../constants/animationConfig';
import { useReduceMotion } from '../../hooks/useReduceMotion';

interface DebugPanelProps {
  onClose: () => void;
  onClearAll: () => void;
  syncLabel?: string;
  syncColor?: string;
  children: React.ReactNode;
}

export function DebugPanel({ onClose, onClearAll, syncLabel, syncColor, children }: DebugPanelProps) {
  const { height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReduceMotion();
  const panelConfig = getPanelConfig(reducedMotion);
  const panelTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    const panelAnim = panelConfig.useSpring
      ? Animated.spring(panelTranslateY, {
          toValue: 0,
          friction: panelConfig.springFriction,
          tension: panelConfig.springTension,
          useNativeDriver: true,
        })
      : Animated.timing(panelTranslateY, {
          toValue: 0,
          duration: panelConfig.backdropDuration,
          useNativeDriver: true,
        });

    Animated.parallel([
      panelAnim,
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: panelConfig.backdropDuration,
        useNativeDriver: true,
      }),
    ]).start();
  }, [panelTranslateY, backdropOpacity, panelConfig]);

  useEffect(() => {
    requestAnimationFrame(animateIn);
  }, [animateIn]);

  const closePanel = useCallback(() => {
    const panelAnim = panelConfig.useSpring
      ? Animated.spring(panelTranslateY, {
          toValue: screenHeight,
          friction: panelConfig.springFriction,
          tension: panelConfig.springTension,
          useNativeDriver: true,
        })
      : Animated.timing(panelTranslateY, {
          toValue: screenHeight,
          duration: panelConfig.backdropDuration,
          useNativeDriver: true,
        });

    Animated.parallel([
      panelAnim,
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: panelConfig.backdropDuration,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => { if (finished) onClose(); });
  }, [panelTranslateY, backdropOpacity, onClose, screenHeight, panelConfig]);

  const closePanelRef = useRef(closePanel);
  closePanelRef.current = closePanel;

  const panelResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          panelTranslateY.setValue(gs.dy);
          backdropOpacity.setValue(Math.max(0, 1 - gs.dy / 200));
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100) {
          closePanelRef.current();
        } else {
          const snapAnim = panelConfig.useSpring
            ? Animated.spring(panelTranslateY, {
                toValue: 0,
                friction: 9,
                tension: 70,
                useNativeDriver: true,
              })
            : Animated.timing(panelTranslateY, {
                toValue: 0,
                duration: panelConfig.backdropDuration,
                useNativeDriver: true,
              });
          snapAnim.start();
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: panelConfig.backdropDuration,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={styles.backdropPressable} onPress={closePanel} />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { transform: [{ translateY: panelTranslateY }] }]}
      >
        <View {...panelResponder.panHandlers}>
          <View style={styles.dragHandle}>
            <View style={styles.dragIndicator} />
          </View>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerMark}>
                <View style={styles.headerMarkDot} />
                <View style={styles.headerMarkLines}>
                  <View style={styles.headerMarkLineLong} />
                  <View style={styles.headerMarkLineShort} />
                </View>
              </View>
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>Debug Toolkit</Text>
                {syncLabel && (
                  <View style={styles.syncRow}>
                    <View style={[styles.syncDot, syncColor ? { backgroundColor: syncColor } : null]} />
                    <Text style={styles.syncText} numberOfLines={1}>{syncLabel}</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.headerButtons}>
              <Pressable
                onPress={() => {
                  onClearAll();
                  closePanel();
                }}
                style={styles.clearButton}
                accessibilityLabel="Clear all"
                accessibilityRole="button"
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
              <Pressable
                onPress={closePanel}
                style={styles.iconButton}
                accessibilityLabel="Close panel"
                accessibilityRole="button"
              >
                <Text style={styles.iconButtonText}>X</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={styles.panelContent}>{children}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdropPressable: { flex: 1 },
  panel: {
    width: '100%',
    height: '90%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.XL,
    borderTopRightRadius: Radius.XL,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  dragHandle: {
    width: '100%',
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.chrome,
  },
  dragIndicator: {
    width: 32,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.dragHandle,
  },
  panelContent: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.SM,
    paddingBottom: Spacing.SM,
    backgroundColor: Colors.chrome,
    borderBottomWidth: 1,
    borderBottomColor: Colors.panelDivider,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
  },
  headerMark: {
    width: 32,
    height: 32,
    borderRadius: Radius.SM,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.XS,
  },
  headerMarkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  headerMarkLines: {
    gap: 3,
  },
  headerMarkLineLong: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.textSecondary,
  },
  headerMarkLineShort: {
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.textMuted,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: FontSize.LG,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    marginTop: Spacing.XS,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 18,
    borderRadius: Radius.SM,
    paddingRight: Spacing.SM,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  syncText: {
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
  },
  clearButton: {
    height: 30,
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceHover,
    paddingHorizontal: Spacing.MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: FontSize.SM,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: Radius.MD,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: FontSize.SM,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
});
