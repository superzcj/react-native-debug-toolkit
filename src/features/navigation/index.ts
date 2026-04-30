import { NavigationLogTab } from './NavigationLogTab';
import type { DebugFeature, NavigationLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createChannelFeature } from '../../utils/createChannelFeature';

type NavigationLogPayload = Omit<NavigationLogEntry, 'id'>;

let navigationChannel = createEventChannel<NavigationLogPayload>();

export const addNavigationLog = (
  action: string,
  from: string,
  to: string,
  startTime?: number,
  duration?: number,
  debugLog?: string,
): void => {
  navigationChannel.emit({
    timestamp: Date.now(),
    action,
    from,
    to,
    startTime,
    duration,
    debugLog,
  });
};

export interface NavigationFeatureConfig {
  /** Maximum number of navigation logs to keep (default: 200) */
  maxLogs?: number;
}

export const createNavigationLogFeature = (config?: NavigationFeatureConfig): DebugFeature<NavigationLogEntry[]> =>
  createChannelFeature(
    () => navigationChannel,
    (payload, id) => ({ ...payload, id }),
    { name: 'navigation', label: 'Navigation', renderContent: NavigationLogTab, maxLogs: config?.maxLogs },
  );

/** Reset module-level state for testing */
export function _resetNavigationForTesting(): void {
  navigationChannel = createEventChannel<NavigationLogPayload>();
}
