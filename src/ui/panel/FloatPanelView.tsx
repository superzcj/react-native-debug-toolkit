import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import type { AnyDebugFeature } from '../../types';
import { Colors } from '../theme/colors';
import { FontSize, Spacing } from '../theme/layout';
import { getPreference, setPreference, KEYS } from '../../utils/debugPreferences';
import { FloatIcon } from '../floating/FloatIcon';
import { DebugPanel } from './DebugPanel';
import { FeatureRail } from './FeatureRail';
import type { RailItem } from './FeatureRail';
import { FeatureIntroCard } from './FeatureIntroCard';
import { buildFeatureSummary } from './buildFeatureSummary';
import { filterFeatureSnapshot } from './filterFeatureSnapshot';
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

// ─── Snapshot helpers ──────────────────────────────────

function snapshotCount(feature: AnyDebugFeature): number | undefined {
  try {
    const snap = feature.getSnapshot();
    if (Array.isArray(snap)) return snap.length;
    if (snap && typeof snap === 'object') {
      const obj = snap as Record<string, unknown>;
      if (Array.isArray(obj.items)) return obj.items.length;
      if (Array.isArray(obj.logs)) return obj.logs.length;
      if (Array.isArray(obj.entries)) return obj.entries.length;
      if (Array.isArray(obj.environments)) return obj.environments.length;
    }
  } catch { /* ignore */ }
  return undefined;
}

interface PanelConnectionStatus {
  label: string;
  color: string;
}

interface DevConnectSnapshot {
  isSimulator?: boolean;
  computerHost?: string;
  daemonPort?: string;
  streaming?: boolean;
}

function buildPanelConnectionStatus(features: AnyDebugFeature[]): PanelConnectionStatus {
  const devConnect = features.find((f) => f.name === 'devConnect');
  if (!devConnect) {
    return { label: 'offline desktop sync unavailable', color: Colors.textMuted };
  }

  try {
    const snap = (devConnect.getSnapshot() ?? {}) as DevConnectSnapshot;
    const host = snap.isSimulator ? 'localhost' : snap.computerHost?.trim();
    const port = snap.daemonPort?.trim();
    const target = host && port ? `${host}:${port}` : host || (port ? `port ${port}` : 'not configured');
    return {
      label: `${snap.streaming ? 'live' : 'offline'} ${target}`,
      color: snap.streaming ? Colors.success : Colors.textMuted,
    };
  } catch {
    return { label: 'offline desktop sync unavailable', color: Colors.textMuted };
  }
}

// ─── Main Component ────────────────────────────────────

interface FloatPanelViewProps {
  features: AnyDebugFeature[];
  panelOpen: boolean;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  onClearAll: () => void;
}

export function FloatPanelView({ features, panelOpen, onOpenPanel, onClosePanel, onClearAll }: FloatPanelViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBad, setFilterBad] = useState(false);
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
      setSearchQuery('');
      setFilterBad(false);
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

  // DevConnect streaming status
  const devConnect = features.find((f) => f.name === 'devConnect');
  const isStreaming = (() => {
    if (!devConnect) return false;
    try {
      const snap = (devConnect.getSnapshot() ?? {}) as DevConnectSnapshot;
      return snap.streaming ?? false;
    } catch { return false; }
  })();

  // Rail items with counts
  const railItems: RailItem[] = features.map((f) => {
    const b = f.badge?.();
    return { id: f.name, label: f.label, dotColor: b?.color ?? null, count: snapshotCount(f) };
  });

  const panelConnectionStatus = buildPanelConnectionStatus(features);

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setFilterBad(false);
    onClearAll();
  }, [onClearAll]);

  // Active feature + summary
  const activeFeature = features[activeTab];
  const activeSnapshot = activeFeature?.getSnapshot();
  const activeSummary = activeFeature ? buildFeatureSummary(activeFeature, activeSnapshot) : null;

  // Filtered snapshot — reuse activeSnapshot to avoid double getSnapshot()
  const filteredSnapshot = activeFeature
    ? filterFeatureSnapshot(activeFeature, activeSnapshot, searchQuery, filterBad ? 'bad' : 'all')
    : null;

  // Render active feature content
  const renderFeatureContent = () => {
    if (features.length === 0) {
      return <Text style={styles.emptyText}>No debug features enabled</Text>;
    }
    const feature = features[activeTab];
    if (!feature) return <Text style={styles.emptyText}>Feature not found</Text>;
    const snapshot = filteredSnapshot;
    const TabComponent = feature.renderContent;
    if (TabComponent) return <TabComponent snapshot={snapshot} feature={feature} />;
    return (
      <View style={styles.genericContent}>
        <Text style={styles.jsonContent}>{JSON.stringify(snapshot, null, 2)}</Text>
      </View>
    );
  };

  const showSearch = activeSummary ? (activeSummary.count != null && activeSummary.count > 0) : false;

  return (
    <DebugErrorBoundary onError={onClosePanel}>
      <View style={styles.container} pointerEvents="box-none">
        <FloatIcon visible={!panelOpen} onPress={onOpenPanel} badge={envBadge} streaming={isStreaming} />
        {panelOpen && (
          <DebugPanel
            onClose={onClosePanel}
            onClearAll={handleClearAll}
            syncLabel={panelConnectionStatus.label}
            syncColor={panelConnectionStatus.color}
          >
            <View style={styles.bodyRow}>
              <FeatureRail items={railItems} activeIndex={activeTab} onSelectTab={switchTab} />
              <View style={styles.contentColumn}>
                {activeFeature && activeSummary && (
                  <FeatureIntroCard
                    title={activeFeature.label}
                    summary={activeSummary}
                    filterBad={filterBad}
                    onFilterBad={setFilterBad}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    showSearch={showSearch}
                  />
                )}
                <Animated.View
                  style={[
                    styles.contentContainer,
                    { opacity: contentOpacity, transform: [{ translateX: contentTranslateX }] },
                  ]}
                  {...panHandlers}
                >
                  {renderFeatureContent()}
                </Animated.View>
              </View>
            </View>
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
  bodyRow: {
    flex: 1,
    flexDirection: 'row',
  },
  contentColumn: {
    flex: 1,
  },
  contentContainer: { flex: 1 },
  emptyText: {
    padding: Spacing.XL,
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: FontSize.SM,
  },
  genericContent: { padding: Spacing.LG, flex: 1 },
  jsonContent: { fontFamily: 'monospace', fontSize: FontSize.SM, color: Colors.text },
});
