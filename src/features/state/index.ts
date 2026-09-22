import type { DebugFeature } from '../../types/feature';
import type { StateEvent, StateLogEntry } from '../../types/logs';
import type { StateAdapter } from '../../types/source';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';
import type { ConfigIssue } from '../../core/config';
import { createObservableStore } from '../../utils/createObservableStore';
import { sanitizeDebugLogEntry } from '../../utils/deviceReport';
import { observeSource } from '../../utils/observeSource';
import { StateLogTab } from './StateLogTab';

export interface StateFeatureConfig { maxLogs?: number; adapters?: readonly StateAdapter[] }
export interface StateFeature extends DebugFeature<StateLogEntry[]>, FeatureDriver {
  record(id: string, event: StateEvent): void;
}

export function createStateFeature(config: StateFeatureConfig = {}): StateFeature {
  const store = createObservableStore<StateLogEntry>();
  const issues: ConfigIssue[] = [];
  let context: FeatureContext | undefined;
  let active = false;
  let nextId = 0;
  let cleanups: Array<() => void> = [];
  const current = () => active && !!context?.isCurrent() && !context.signal.aborted;
  const status = () => {
    if (current()) {context!.setStatus({
      phase: issues.length ? 'error' : store.getData().length ? 'ready' : 'empty', issues: [...issues],
    });}
  };
  const record = (storeId: string, event: StateEvent) => {
    if (!current()) {return;}
    const snapshot = sanitizeDebugLogEntry(event) as StateEvent;
    store.push({ ...snapshot, storeId, id: String(nextId++), timestamp: Date.now() }, config.maxLogs ?? 200);
    status();
  };
  const dispose = () => {
    active = false;
    context?.signal.removeEventListener('abort', dispose);
    const releases = cleanups; cleanups = [];
    releases.forEach(release => release());
    store.clear();
  };
  return {
    name: 'state', label: 'State', renderContent: StateLogTab,
    setup() {}, cleanup: dispose, dispose,
    getSnapshot: store.getData, subscribe: store.subscribe,
    clear() { store.clear(); status(); }, record,
    start(ctx) {
      if (active || ctx.signal.aborted || !ctx.isCurrent()) {return;}
      context = ctx; active = true; issues.length = 0;
      ctx.signal.addEventListener('abort', dispose, { once: true });
      config.adapters?.forEach((adapter, index) => {
        if (!current()) {return;}
        let initialized = false;
        let before: unknown;
        const release = observeSource(adapter, {
          signal: ctx.signal,
          onSnapshot(value) {
            if (!current()) {return;}
            const after = sanitizeDebugLogEntry(value);
            if (initialized) {record(adapter.id, { action: 'change', before, after });}
            before = after;
            initialized = true;
          },
          onError(error) {
            issues.push({ path: `state.adapters[${index}]`, message: error instanceof Error ? error.message : String(error) });
            status();
          },
        });
        if (current()) {cleanups.push(release);}
        else {release();}
      });
      status();
    },
  };
}
