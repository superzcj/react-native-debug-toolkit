import { ZustandLogTab } from './ZustandLogTab';
import type { DebugFeature, ZustandLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createChannelFeature } from '../../utils/createChannelFeature';

type ZustandLogPayload = Omit<ZustandLogEntry, 'id'>;

let zustandChannel = createEventChannel<ZustandLogPayload>();

export const addZustandLog = (
  action: string,
  prevState: unknown,
  nextState: unknown,
  actionCompleteTime?: number,
  storeName?: string,
): void => {
  zustandChannel.emit({
    timestamp: Date.now(),
    action,
    prevState,
    nextState,
    actionCompleteTime,
    storeName,
  });
};

// ─── Zustand middleware (remains here — it's user-facing API) ──────────

type ZustandSetState<T> = (
  partial: T | Partial<T> | ((state: T) => Partial<T> | T),
  replace?: boolean | undefined,
  action?: string | { type: unknown } | undefined,
) => void;

type ZustandGetState<T> = () => T;

interface ZustandStoreApi<T> {
  getState: () => T;
  setState: ZustandSetState<T>;
  subscribe: (listener: (state: T, prevState: T) => void) => () => void;
  name?: string;
}

type ZustandConfig<T> = (
  set: ZustandSetState<T>,
  get: ZustandGetState<T>,
  api: ZustandStoreApi<T>,
) => T;

/**
 * Zustand middleware that logs all state changes to the debug toolkit.
 *
 * Usage:
 * ```ts
 * const useStore = create(zustandLogMiddleware((set) => ({ ... })))
 * ```
 */
export const zustandLogMiddleware = <T>(config: ZustandConfig<T>) => (
  set: ZustandSetState<T>,
  get: ZustandGetState<T>,
  api: ZustandStoreApi<T>,
) =>
  config(
    (args: Parameters<ZustandSetState<T>>[0], replace?: boolean, actionName?: string | { type: unknown }) => {
      const prevState = get();
      const startTime = Date.now();
      set(args, replace, actionName);
      const duration = Date.now() - startTime;
      const label = typeof actionName === 'string'
        ? actionName
        : typeof args === 'function' ? 'setState' : 'object-set';
      addZustandLog(
        label,
        prevState,
        get(),
        duration,
        api.name,
      );
    },
    get,
    api,
  );

// ─── Feature factory ──────────────────────────────────────────────────

export interface ZustandFeatureConfig {
  /** Maximum number of zustand state changes to keep (default: 200) */
  maxLogs?: number;
}

export const createZustandLogFeature = (config?: ZustandFeatureConfig): DebugFeature<ZustandLogEntry[]> =>
  createChannelFeature(
    () => zustandChannel,
    (payload, id) => ({ ...payload, id }),
    { name: 'zustand', label: 'Zustand', renderContent: ZustandLogTab, maxLogs: config?.maxLogs },
  );

/** Reset module-level state for testing */
export function _resetZustandForTesting(): void {
  zustandChannel = createEventChannel<ZustandLogPayload>();
}
