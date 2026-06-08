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

interface DebugPanelProps {
  onClose: () => void;
  onClearAll: () => void;
  syncLabel?: string;
  syncColor?: string;
  children: React.ReactNode;
}

export function DebugPanel({ onClose, onClearAll, syncLabel, syncColor, children }: DebugPanelProps) {
  const { height: screenHeight } = useWindowDimensions();
  const panelTranslateY = useRef(new Animated.Value(screenHeight)).current;
  const panelScale = useRef(new Animated.Value(0.96)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const glassGlowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(panelTranslateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(panelScale, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(glassGlowOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [panelTranslateY, panelScale, backdropOpacity, glassGlowOpacity]);

  const closePanel = useCallback(() => {
    Animated.parallel([
      Animated.spring(panelTranslateY, {
        toValue: screenHeight,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.spring(panelScale, {
        toValue: 0.96,
        friction: 10,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(glassGlowOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [panelTranslateY, panelScale, backdropOpacity, glassGlowOpacity, onClose, screenHeight]);

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
          closePanel();
        } else {
          Animated.parallel([
            Animated.spring(panelTranslateY, {
              toValue: 0,
              friction: 8,
              tension: 50,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdropGlowTop, { opacity: glassGlowOpacity }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.backdropGlowBottom, { opacity: glassGlowOpacity }]}
        />
        <Pressable style={styles.backdropPressable} onPress={closePanel} />
      </Animated.View>
      <Animated.View
        style={[styles.panel, { transform: [{ translateY: panelTranslateY }, { scale: panelScale }] }]}
      >
        <View pointerEvents="none" style={styles.panelGlass} />
        <View pointerEvents="none" style={styles.panelTopLight} />
        <View pointerEvents="none" style={styles.panelBottomFade} />
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
    backgroundColor: Colors.glassScrim,
  },
  backdropGlowTop: {
    position: 'absolute',
    top: -140,
    right: -100,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: Colors.glassGlow,
  },
  backdropGlowBottom: {
    position: 'absolute',
    bottom: 80,
    left: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(53,199,89,0.14)',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    width: '100%',
    height: '90%',
    backgroundColor: Colors.glassPanel,
    borderTopLeftRadius: Radius.XL,
    borderTopRightRadius: Radius.XL,
    borderWidth: 1,
    borderColor: Colors.glassStroke,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  panelGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.glassInnerGlow,
  },
  panelTopLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: Colors.glassHighlight,
  },
  panelBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: Colors.glassEdgeLight,
  },
  dragHandle: {
    width: '100%',
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glassChrome,
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
    backgroundColor: Colors.glassChrome,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glassStroke,
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
    backgroundColor: Colors.glassChromeStrong,
    borderWidth: 1,
    borderColor: Colors.glassStroke,
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
    backgroundColor: Colors.glassChromeStrong,
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
    backgroundColor: Colors.glassChromeStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: FontSize.SM,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
});
