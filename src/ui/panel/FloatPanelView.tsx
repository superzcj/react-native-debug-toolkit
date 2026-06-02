import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import type { AnyDebugFeature } from '../../types';
import { getPreference, setPreference, KEYS } from '../../utils/debugPreferences';
import { FloatIcon } from '../floating/FloatIcon';
import { DebugPanel } from './DebugPanel';
import { FeatureTabBar } from './FeatureTabBar';
import type { TabItem } from './FeatureTabBar';
import { resolveStoredTabIndex } from './tabPersistence';
import { useTabAnimation } from './useTabAnimation';

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
    if (tabLoaded.current || features.length === 0) return;
    let mounted = true;
    getPreference(KEYS.lastTab).then((val) => {
      if (!mounted || tabLoaded.current) return;
      const idx = resolveStoredTabIndex(features, val);
      setActiveTab(idx);
      const featureName = features[idx]?.name;
      if (featureName && featureName !== val) {
        setPreference(KEYS.lastTab, featureName);
      }
      tabLoaded.current = true;
    });
    return () => { mounted = false; };
  }, [features]);

  const { contentOpacity, contentTranslateX, panHandlers, switchTab } = useTabAnimation({
    activeTab,
    tabCount: features.length,
    onTabChange: useCallback((index: number) => {
      tabLoaded.current = true;
      setActiveTab(index);
      const featureName = features[index]?.name;
      if (featureName) {
        setPreference(KEYS.lastTab, featureName);
      }
    }, [features]),
  });

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
      tabLoaded.current = true;
      setActiveTab(0);
      const featureName = features[0]?.name;
      if (featureName) {
        setPreference(KEYS.lastTab, featureName);
      }
    }
  }, [features, activeTab]);

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
              {...panHandlers}
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
