import React, { Component, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import type { AnyDebugFeature } from '../../types';
import type { DebugQuickAction } from '../../types/config';
import { Colors } from '../theme/colors';
import { FontSize, Spacing } from '../theme/layout';
import { getPreference, persistPreference, KEYS } from '../../utils/debugPreferences';
import { FloatIcon } from '../floating/FloatIcon';
import { DebugPanel } from './DebugPanel';
import { FeatureRail } from './FeatureRail';
import type { RailItem } from './FeatureRail';
import { FeatureIntroCard } from './FeatureIntroCard';
import { FeatureStatusView } from './FeatureStatusView';
import { buildFeatureSummary } from './buildFeatureSummary';
import { filterFeatureSnapshot } from './filterFeatureSnapshot';
import {
  INITIAL_PANEL_FILTER_STATE,
  changeTabWithFilterReset,
  clearAllWithFilterReset,
  panelFilterReducer,
} from './panelFilterState';
import { resolveStoredTabIndex } from './tabPersistence';
import { useTabAnimation } from './useTabAnimation';
import { t } from '../../i18n';
import { FEATURE_LABELS, FEATURE_LABEL_KEYS, type BuiltinFeatureKey } from '../../core/featureCatalog';

// ─── Error Boundary ────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class DebugErrorBoundary extends Component<
  { children: React.ReactNode; onError?: () => void; name?: string },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DebugToolkit] Panel crashed:', error, info.componentStack);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return <FeatureStatusView name={this.props.name ?? 'panel'} status={{ phase: 'error', issues: [{ path: `${this.props.name ?? 'panel'}.render`, message: this.state.message ?? 'Render failed.' }] }} />;
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
      if (typeof obj.accountCount === 'number') return obj.accountCount;
    }
  } catch { /* ignore */ }
  return undefined;
}

interface PanelConnectionStatus {
  label: string;
  color: string;
}

interface DevConnectSnapshot {
  canonicalEndpoint?: string;
}

function buildPanelConnectionStatus(features: AnyDebugFeature[]): PanelConnectionStatus {
  const devConnect = features.find((f) => f.name === 'connect');
  if (!devConnect) {
    return { label: t('panel.sharedHubUnavailable'), color: Colors.textMuted };
  }

  try {
    const snap = (devConnect.getSnapshot() ?? {}) as DevConnectSnapshot;
    const endpoint = snap.canonicalEndpoint?.trim();
    return {
      label: endpoint ? t('panel.sharedHubConfigured') : t('panel.sharedHubNotConfigured'),
      color: Colors.textMuted,
    };
  } catch {
    return { label: t('panel.sharedHubUnavailable'), color: Colors.textMuted };
  }
}

// ─── Main Component ────────────────────────────────────

interface FloatPanelViewProps {
  features: AnyDebugFeature[];
  panelOpen: boolean;
  panelTarget?: string;
  panelRequest?: number;
  onClearPanelTarget?: () => void;
  quickActions?: readonly DebugQuickAction[];
  onOpenPanel: () => void;
  onClosePanel: () => void;
  onClearAll: () => void;
}

export function FloatPanelView({ features, panelOpen, panelTarget, panelRequest, onClearPanelTarget, quickActions = [], onOpenPanel, onClosePanel, onClearAll }: FloatPanelViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = useMemo(() => features.filter((feature) => !feature.action
    || feature.status.phase === 'error' || feature.status.phase === 'unavailable'), [features]);
  const [filters, dispatchFilters] = useReducer(
    panelFilterReducer,
    INITIAL_PANEL_FILTER_STATE,
  );
  const { searchQuery, filterBad, searchExpanded } = filters;
  const tabLoaded = useRef(false);
  const handledPanelRequest = useRef<number | undefined>(undefined);
  const actionFrame = useRef<number | null>(null);
  const actionRunning = useRef(false);
  useLayoutEffect(() => () => {
    if (actionFrame.current !== null) {
      cancelAnimationFrame(actionFrame.current);
      actionFrame.current = null;
    }
  }, []);

  const runAction = useCallback((select: () => void | Promise<void>) => {
    if (actionFrame.current === null && !actionRunning.current) {
      actionFrame.current = requestAnimationFrame(async () => {
        actionFrame.current = null;
        actionRunning.current = true;
        try {
          await select();
        } finally {
          actionRunning.current = false;
        }
      });
    }
    onClosePanel();
  }, [onClosePanel]);

  // Restore last tab on mount
  useEffect(() => {
    if (tabLoaded.current || tabs.length === 0) return;
    let mounted = true;
    getPreference(KEYS.lastTab).then((val) => {
      if (!mounted || tabLoaded.current) return;
      const idx = resolveStoredTabIndex(tabs, val);
      setActiveTab(idx);
      const featureName = tabs[idx]?.name;
      if (featureName && featureName !== val) {
        void persistPreference(KEYS.lastTab, featureName);
      }
      tabLoaded.current = true;
    });
    return () => { mounted = false; };
  }, [tabs]);

  const { contentOpacity, contentTranslateX, panHandlers, switchTab } = useTabAnimation({
    activeTab,
    tabCount: tabs.length,
    onTabSelect: onClearPanelTarget,
    onTabChange: useCallback((index: number) => {
      tabLoaded.current = true;
      changeTabWithFilterReset(dispatchFilters, setActiveTab, index);
      const featureName = tabs[index]?.name;
      if (featureName) {
        void persistPreference(KEYS.lastTab, featureName);
      }
    }, [tabs]),
  });

  useEffect(() => {
    if (!panelTarget || !panelOpen || panelRequest === handledPanelRequest.current) return;
    const feature = features.find(item => item.name === panelTarget);
    if (feature?.action && !tabs.includes(feature)) {
      if (!feature.onSelect || feature.status.phase === 'initializing') return;
      handledPanelRequest.current = panelRequest;
      runAction(feature.onSelect);
      return;
    }
    const index = tabs.findIndex(item => item.name === panelTarget);
    if (index >= 0) { handledPanelRequest.current = panelRequest; tabLoaded.current = true; changeTabWithFilterReset(dispatchFilters, setActiveTab, index); }
  }, [panelTarget, panelRequest, panelOpen, features, tabs, runAction]);

  // Feature subscription → re-render on data changes
  const [, setTick] = useState(0);
  useEffect(() => {
    let frame: number | null = null;
    const scheduleRefresh = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        setTick((tick) => tick + 1);
      });
    };
    const unsubs = features
      .map((f) => f.subscribe?.(scheduleRefresh))
      .filter((u): u is () => void => typeof u === 'function');
    return () => {
      unsubs.forEach((u) => u());
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [features]);

  // Clamp activeTab if features shrink
  useEffect(() => {
    if (tabs.length > 0 && activeTab >= tabs.length) {
      tabLoaded.current = true;
      setActiveTab(0);
      const featureName = tabs[0]?.name;
      if (featureName) {
        void persistPreference(KEYS.lastTab, featureName);
      }
    }
  }, [tabs, activeTab]);

  // Badge (first feature that returns one)
  const envBadge = features.map((f) => f.badge?.()).find((b) => b != null) ?? null;

  // Rail items with counts
  const featureLabel = (feature: AnyDebugFeature): string => {
    const name = feature.name as BuiltinFeatureKey;
    const key = FEATURE_LABEL_KEYS[name];
    return key && feature.label === FEATURE_LABELS[name]
      ? t(key)
      : feature.label;
  };

  const railItems: RailItem[] = features.map((f) => {
    const b = f.badge?.();
    return { id: f.name, label: featureLabel(f), dotColor: b?.color ?? null, count: snapshotCount(f), disabled: !!f.action && !tabs.includes(f) && (!f.onSelect || f.status.phase === 'initializing') };
  });

  const panelConnectionStatus = buildPanelConnectionStatus(features);

  const handleClearAll = useCallback(() => {
    clearAllWithFilterReset(dispatchFilters, onClearAll);
  }, [onClearAll]);

  // Active feature + summary
  const activeFeature = tabs[activeTab];
  let activeSnapshot: unknown;
  let snapshotIssue: { path: string; message: string } | undefined;
  try { activeSnapshot = activeFeature?.getSnapshot(); }
  catch (error) {
    snapshotIssue = { path: `${activeFeature?.name}.snapshot`, message: error instanceof Error ? error.message : String(error) };
  }
  const activeSummary = activeFeature && !activeFeature.action && !snapshotIssue ? buildFeatureSummary(activeFeature, activeSnapshot) : null;

  // Filtered snapshot — reuse activeSnapshot to avoid double getSnapshot()
  const filteredSnapshot = activeFeature && !snapshotIssue
    ? filterFeatureSnapshot(activeFeature, activeSnapshot, searchQuery, filterBad ? 'bad' : 'all')
    : null;

  // Render active feature content
  const renderFeatureContent = () => {
    if (tabs.length === 0) {
      return <Text style={styles.emptyText}>{t(features.length ? 'panel.selectAction' : 'panel.noFeatures')}</Text>;
    }
    const feature = tabs[activeTab];
    if (!feature) return <Text style={styles.emptyText}>{t('panel.featureNotFound')}</Text>;
    if (feature.action) { return null; }
    const snapshot = filteredSnapshot;
    const TabComponent = feature.renderContent;
    if (TabComponent) return <TabComponent snapshot={snapshot} feature={feature} searchQuery={searchQuery} />;
    return (
      <View style={styles.genericContent}>
        <Text style={styles.jsonContent}>{JSON.stringify(snapshot, null, 2)}</Text>
      </View>
    );
  };

  const showSearch = Array.isArray(activeSnapshot) && activeSnapshot.length > 0;

  return (
    <DebugErrorBoundary onError={onClosePanel}>
      <View style={styles.container} pointerEvents="box-none">
        <FloatIcon visible={!panelOpen} onPress={onOpenPanel} badge={envBadge} streaming={false} quickActions={quickActions} />
        {panelOpen && (
          <DebugPanel
            onDismissStart={onClearPanelTarget}
            onClose={onClosePanel}
            onClearAll={handleClearAll}
            syncLabel={panelConnectionStatus.label}
            syncColor={panelConnectionStatus.color}
          >
            <View style={styles.body}>
              <FeatureRail items={railItems} activeIndex={activeFeature ? features.indexOf(activeFeature) : -1} onSelectTab={(index) => {
                const feature = features[index];
                if (!feature) return;
                if (feature.action && !tabs.includes(feature)) {
                  if (!feature.onSelect || feature.status.phase === 'initializing') return;
                  runAction(feature.onSelect);
                } else {
                  switchTab(tabs.indexOf(feature));
                }
              }} />
              <View style={styles.contentColumn}>
                {activeFeature && activeSummary && (
                  <FeatureIntroCard
                    title={featureLabel(activeFeature)}
                    summary={activeSummary}
                    filterBad={filterBad}
                    onFilterBad={(bad) => dispatchFilters({ type: 'set-bad', bad })}
                    searchQuery={searchQuery}
                    onSearchChange={(query) => dispatchFilters({ type: 'set-query', query })}
                    showSearch={showSearch}
                    searchExpanded={searchExpanded}
                    onSearchExpandedChange={(expanded) => (
                      dispatchFilters({ type: 'set-search-expanded', expanded })
                    )}
                  />
                )}
                <Animated.View
                  style={[
                    styles.contentContainer,
                    { opacity: contentOpacity, transform: [{ translateX: contentTranslateX }] },
                  ]}
                  {...panHandlers}
                >
                  {activeFeature ? <View testID={`debug-page-${activeFeature.name}`} style={styles.contentContainer}>
                    <DebugErrorBoundary key={activeFeature.name} name={activeFeature.name}>
                      <FeatureStatusView name={activeFeature.name} status={snapshotIssue
                        ? { phase: 'error', issues: [snapshotIssue] } : activeFeature.status} />
                      {!snapshotIssue && renderFeatureContent()}
                    </DebugErrorBoundary>
                  </View> : renderFeatureContent()}
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
  body: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.background,
  },
  contentColumn: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyText: {
    padding: Spacing.XL,
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: FontSize.SM,
  },
  genericContent: { padding: Spacing.LG, flex: 1 },
  jsonContent: { fontFamily: 'monospace', fontSize: FontSize.SM, color: Colors.text },
});
