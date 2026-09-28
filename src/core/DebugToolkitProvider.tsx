import React, { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { ToolkitHost, ToolkitHostSnapshot } from './DebugToolkit';
import { FloatPanelView } from '../ui/panel/FloatPanelView';
import { CopyActionContext } from '../ui/shared/CopyButton';
import { copyToComputer } from '../utils/copyToComputer';

const empty: ToolkitHostSnapshot = { features: [], panelOpen: false, quickActions: [] };
const emptySnapshot = () => empty;
const noSubscription = () => () => {};
const disabledCopy = (text: string) => copyToComputer(text, { enabled: false, channels: {} });

/** Internal view binding. Only withDebugToolkit owns the host lifecycle. */
export function DebugToolkitProvider({ host, children }: { host: ToolkitHost | null; children: ReactNode }) {
  const state = useSyncExternalStore(host?.subscribe ?? noSubscription, host?.getSnapshot ?? emptySnapshot, emptySnapshot);
  return (
    <CopyActionContext.Provider value={host?.actions.copyToComputer ?? disabledCopy}>
      {children}
      {!!host && (state.features.length > 0 || state.quickActions.length > 0) && (
        <FloatPanelView features={state.features} panelOpen={state.panelOpen}
          quickActions={state.quickActions}
          onOpenPanel={host.actions.open} onClosePanel={host.actions.close} onClearAll={() => host.actions.clear()} />
      )}
    </CopyActionContext.Provider>
  );
}
