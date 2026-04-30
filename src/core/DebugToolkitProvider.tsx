import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DebugToolkit } from './DebugToolkit';
import { FloatPanelView } from '../ui/panel/FloatPanelView';
import type { AnyDebugFeature } from '../types';

interface ToolkitContextValue {
  features: AnyDebugFeature[];
  showLauncher: () => void;
  hideLauncher: () => void;
  clearAll: () => void;
}

const ToolkitContext = createContext<ToolkitContextValue | null>(null);

interface ProviderState {
  launcherVisible: boolean;
  panelOpen: boolean;
  features: AnyDebugFeature[];
}

interface DebugToolkitProviderProps {
  children: ReactNode;
}

export function DebugToolkitProvider({ children }: DebugToolkitProviderProps) {
  const [state, setState] = useState<ProviderState>(() => ({
    launcherVisible: DebugToolkit.launcherVisible,
    panelOpen: DebugToolkit.panelOpen,
    features: DebugToolkit.features,
  }));

  useEffect(() => {
    // Sync current state — initializeDebugToolkit() may have been called
    // in a child useEffect that runs before this parent effect subscribes.
    setState({
      launcherVisible: DebugToolkit.launcherVisible,
      panelOpen: DebugToolkit.panelOpen,
      features: DebugToolkit.features,
    });

    const unsubscribe = DebugToolkit.subscribe(() => {
      setState({
        launcherVisible: DebugToolkit.launcherVisible,
        panelOpen: DebugToolkit.panelOpen,
        features: DebugToolkit.features,
      });
    });
    return unsubscribe;
  }, []);

  const showLauncher = useCallback(() => { DebugToolkit.showLauncher(); }, []);
  const hideLauncher = useCallback(() => { DebugToolkit.hideLauncher(); }, []);
  const clearAll = useCallback(() => { DebugToolkit.clearAll(); }, []);

  const contextValue = useMemo<ToolkitContextValue>(
    () => ({
      features: state.features,
      showLauncher,
      hideLauncher,
      clearAll,
    }),
    [state.features, showLauncher, hideLauncher, clearAll],
  );

  return (
    <ToolkitContext.Provider value={contextValue}>
      {children}
      {state.launcherVisible && (
        <FloatPanelView
          features={state.features}
          panelOpen={state.panelOpen}
          onOpenPanel={() => DebugToolkit.openPanel()}
          onClosePanel={() => DebugToolkit.closePanel()}
          onClearAll={() => DebugToolkit.clearAll()}
        />
      )}
    </ToolkitContext.Provider>
  );
}

export function useDebugToolkit(): ToolkitContextValue {
  const context = useContext(ToolkitContext);
  if (!context) {
    throw new Error(
      'useDebugToolkit must be used within a <DebugToolkitProvider>. ' +
        'Wrap your app with <DebugToolkitProvider>.',
    );
  }
  return context;
}
