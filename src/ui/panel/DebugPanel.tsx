import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Pressable,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Colors } from '../theme/colors';

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
              <Text style={styles.headerTitle}>Debug Toolkit</Text>
              {syncLabel && (
                <View style={styles.syncRow}>
                  <View style={[styles.syncDot, syncColor ? { backgroundColor: syncColor } : null]} />
                  <Text style={styles.syncText} numberOfLines={1}>{syncLabel}</Text>
                </View>
              )}
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={() => {
                  onClearAll();
                  closePanel();
                }}
                style={styles.iconButton}
                activeOpacity={0.6}
                accessibilityLabel="Clear all"
                accessibilityRole="button"
              >
                <Text style={styles.iconButtonText}>C</Text>
              </TouchableOpacity>
              <Pressable
                onPress={closePanel}
                style={styles.iconButton}
                accessibilityLabel="Close panel"
                accessibilityRole="button"
              >
                <Text style={styles.iconButtonText}>✕</Text>
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
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdropPressable: { flex: 1 },
  panel: {
    width: '100%',
    height: '90%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  dragHandle: {
    width: '100%',
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  dragIndicator: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textLight,
  },
  panelContent: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
  },
  syncText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
});
