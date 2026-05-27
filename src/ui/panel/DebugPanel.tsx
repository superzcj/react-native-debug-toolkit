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
  children: React.ReactNode;
}

export function DebugPanel({ onClose, onClearAll, children }: DebugPanelProps) {
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
            <Text style={styles.headerTitle}>Debug Toolkit</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={() => {
                  onClearAll();
                  closePanel();
                }}
                style={styles.clearButton}
                activeOpacity={0.6}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <Pressable onPress={closePanel} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
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
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textLight,
  },
  panelContent: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: Colors.surface,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${Colors.error}0F`,
  },
  clearButtonText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '400',
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
