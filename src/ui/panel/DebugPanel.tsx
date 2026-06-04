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
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(panelTranslateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [panelTranslateY, backdropOpacity]);

  const closePanel = useCallback(() => {
    Animated.parallel([
      Animated.spring(panelTranslateY, {
        toValue: screenHeight,
        friction: 8,
        tension: 65,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [panelTranslateY, backdropOpacity, onClose, screenHeight]);

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
          Animated.spring(panelTranslateY, {
            toValue: 0,
            friction: 8,
            tension: 50,
            useNativeDriver: true,
          }).start();
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 200,
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
                <Text style={styles.headerMarkText}>DT</Text>
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
    borderTopLeftRadius: Radius.XXL,
    borderTopRightRadius: Radius.XXL,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  dragHandle: {
    width: '100%',
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
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
    paddingTop: Spacing.XS,
    paddingBottom: Spacing.MD,
    backgroundColor: Colors.surface,
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
    width: 34,
    height: 34,
    borderRadius: Radius.LG,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMarkText: {
    fontSize: FontSize.SM,
    fontWeight: FontWeight.bold,
    color: Colors.primaryLight,
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
    marginTop: Spacing.XXS,
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
