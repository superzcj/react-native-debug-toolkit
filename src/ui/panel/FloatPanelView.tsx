import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Easing,
} from 'react-native';
import type { AnyDebugFeature } from '../../types';
import { getPreference, setPreference, KEYS } from '../../utils/debugPreferences';
import { FloatIcon } from '../floating/FloatIcon';
import { DebugPanel } from './DebugPanel';
import { FeatureTabBar } from './FeatureTabBar';
import type { TabItem } from './FeatureTabBar';

// ─── Error Boundary ────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
}

class DebugErrorBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DebugToolkit] Panel crashed:', error, info.componentStack);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface FloatPanelViewProps {
  features: AnyDebugFeature[];
  panelOpen: boolean;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  onClearAll: () => void;
}

export function FloatPanelView({ features, panelOpen, onOpenPanel, onClosePanel, onClearAll }: FloatPanelViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabLoaded = useRef(false);

  // Restore last tab on mount
  useEffect(() => {
    let mounted = true;
    getPreference(KEYS.lastTab).then((val) => {
      if (!mounted || !val) return;
      const idx = parseInt(val, 10);
      if (!isNaN(idx) && idx >= 0) {
        setActiveTab(idx);
        tabLoaded.current = true;
      }
    });
    return () => { mounted = false; };
  }, []);

  // Content slide animation
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const isSwitchingTab = useRef(false);

  // Refs to avoid stale closures in PanResponder
  const activeTabRef = useRef(0);
  activeTabRef.current = activeTab;
  const featuresLengthRef = useRef(features.length);
  featuresLengthRef.current = features.length;
  const switchTabRef = useRef<(index: number) => void>(() => {});

  // Swipe-to-switch responder
  const swipeResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => {
        if (isSwitchingTab.current) return false;
        return Math.abs(gs.dx) > 25 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2.5;
      },
      onPanResponderRelease: (_, gs) => {
        const tab = activeTabRef.current;
        if (gs.dx < -40 && tab < featuresLengthRef.current - 1) switchTabRef.current(tab + 1);
        else if (gs.dx > 40 && tab > 0) switchTabRef.current(tab - 1);
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  // Feature subscription → re-render on data changes
  const [, setTick] = useState(0);
  const refreshQueued = useRef(false);
  const scheduleRefresh = useCallback(() => {
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    requestAnimationFrame(() => {
      refreshQueued.current = false;
      setTick((t) => t + 1);
    });
  }, []);

  useEffect(() => {
    const unsubs = features
      .map((f) => f.subscribe?.(() => scheduleRefresh()))
      .filter((u): u is () => void => typeof u === 'function');
    return () => unsubs.forEach((u) => u());
  }, [features, scheduleRefresh]);

  // Clamp activeTab if features shrink
  useEffect(() => {
    if (features.length > 0 && activeTab >= features.length) {
      setActiveTab(0);
      setPreference(KEYS.lastTab, '0');
    }
  }, [features.length, activeTab]);

  // Tab switching with content animation
  const switchTab = useCallback(
    (index: number) => {
      if (isSwitchingTab.current || index === activeTabRef.current) return;
      isSwitchingTab.current = true;
      const direction = index > activeTabRef.current ? 1 : -1;

      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.timing(contentTranslateX, {
          toValue: -direction * 40,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActiveTab(index);
        setPreference(KEYS.lastTab, String(index));
        contentTranslateX.setValue(direction * 40);
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(contentTranslateX, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          isSwitchingTab.current = false;
        });
      });
    },
    [contentOpacity, contentTranslateX],
  );

  // Keep ref in sync
  switchTabRef.current = switchTab;

  // Badge (first feature that returns one)
  const envBadge = features.map((f) => f.badge?.()).find((b) => b != null) ?? null;
  const tabs: TabItem[] = features.map((f) => ({ label: f.label, id: f.name }));

  // Render active feature content
  const renderFeatureContent = () => {
    if (features.length === 0) {
      return <Text style={styles.emptyText}>No debug features enabled</Text>;
    }
    const feature = features[activeTab];
    if (!feature) return <Text style={styles.emptyText}>Feature not found</Text>;
    const snapshot = feature.getSnapshot();
    const TabComponent = feature.renderContent;
    if (TabComponent) return <TabComponent snapshot={snapshot} feature={feature} />;
    return (
      <View style={styles.genericContent}>
        <Text style={styles.jsonContent}>{JSON.stringify(snapshot, null, 2)}</Text>
      </View>
    );
  };

  return (
    <DebugErrorBoundary onError={onClosePanel}>
      <View style={styles.container} pointerEvents="box-none">
        <FloatIcon visible={!panelOpen} onPress={onOpenPanel} badge={envBadge} />
        {panelOpen && (
          <DebugPanel
            onClose={onClosePanel}
            onClearAll={onClearAll}
          >
            <FeatureTabBar tabs={tabs} activeIndex={activeTab} onSelectTab={switchTab} />
            <Animated.View
              style={[
                styles.contentContainer,
                { opacity: contentOpacity, transform: [{ translateX: contentTranslateX }] },
              ]}
              {...swipeResponder.panHandlers}
            >
              {renderFeatureContent()}
            </Animated.View>
          </DebugPanel>
        )}
      </View>
    </DebugErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  contentContainer: { flex: 1 },
  emptyText: {
    padding: 20,
    textAlign: 'center',
    color: '#C7C7CC',
    fontSize: 13,
  },
  genericContent: { padding: 16, flex: 1 },
  jsonContent: { fontFamily: 'monospace', fontSize: 12, color: '#1C1C1E' },
});
