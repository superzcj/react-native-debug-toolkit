import { NavigationLogTab } from './NavigationLogTab';
import type { DebugFeature, NavigationLogEntry } from '../../types';
import { createEventChannel } from '../../utils/createEventChannel';
import { createChannelFeature } from '../../utils/createChannelFeature';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';
import type { DebugNavigationRef } from '../../types/navigation';
import type { NavigationEvent } from '../../types/logs';
import { sanitizeDebugLogEntry } from '../../utils/deviceReport';

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
  ref?: { current: DebugNavigationRef | null };
}

export interface NavigationFeature extends DebugFeature<NavigationLogEntry[]>, FeatureDriver {
  record(event: NavigationEvent): void;
}

export const createNavigationLogFeature = (config?: NavigationFeatureConfig): NavigationFeature => {
  const channel = createEventChannel<NavigationLogPayload>();
  const base = createChannelFeature(
    () => channel,
    (payload, id) => ({ ...payload, id }),
    { name: 'navigation', label: 'Navigation', renderContent: NavigationLogTab, maxLogs: config?.maxLogs },
  );
  let context: FeatureContext | undefined;
  let active = false;
  let removeLegacy: (() => void) | undefined;
  let removeListener: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  let previous: { key?: string; name: string } | undefined;
  let failed = false;
  const current = () => active && (!context || (context.isCurrent() && !context.signal.aborted));
  const status = () => {
    if (current() && !failed) {context?.setStatus({ phase: base.getSnapshot().length ? 'ready' : 'empty', issues: [] });}
  };
  const settle = () => { if (timer !== undefined) {clearTimeout(timer);} timer = undefined; finish?.(); finish = undefined; };
  const fail = (error: unknown) => {
    failed = true;
    if (current()) {context?.setStatus({ phase: 'error', issues: [{ path: 'navigation.ref', message: error instanceof Error ? error.message : String(error) }] });}
    const release = removeListener; removeListener = undefined;
    try { release?.(); } catch { /* Preserve the original navigation failure. */ }
    settle();
  };
  const record = (event: NavigationEvent) => {
    if (!current()) {return;}
    const snapshot = sanitizeDebugLogEntry(event) as NavigationEvent;
    channel.emit({ ...snapshot, timestamp: Date.now() });
    status();
  };
  const setup = () => {
    if (active) {return;}
    active = true;
    base.setup();
    removeLegacy = navigationChannel.subscribe(payload => { if (current()) { channel.emit(payload); status(); } });
  };
  const dispose = () => {
    active = false;
    context?.signal.removeEventListener('abort', dispose);
    settle();
    const release = removeListener; removeListener = undefined;
    try { release?.(); } catch { /* Remaining cleanup must always run. */ }
    removeLegacy?.(); removeLegacy = undefined;
    base.cleanup();
  };
  return {
    ...base, setup, cleanup: dispose, dispose, record,
    clear() { base.clear?.(); status(); },
    start(ctx) {
      if (pending) {return pending;}
      if (ctx.signal.aborted || !ctx.isCurrent()) {return;}
      context = ctx; setup();
      ctx.signal.addEventListener('abort', dispose, { once: true });
      if (!config?.ref) { status(); return; }
      const deadline = Date.now() + 10_000;
      pending = new Promise<void>(resolve => { finish = resolve; });
      const poll = () => {
        if (!current()) { settle(); return; }
        try {
          const ref = config.ref!.current;
          if (ref && (!ref.isReady || ref.isReady())) {
            const observe = () => {
              if (!current() || failed) {return;}
              try {
                const route = ref.getCurrentRoute();
                if (!route) {return;}
                if (typeof route.name !== 'string' || (route.key !== undefined && typeof route.key !== 'string')) {throw new Error('Invalid current route.');}
                if (previous && previous.key === route.key && previous.name === route.name) {return;}
                const next = { key: route.key, name: route.name };
                const event = { action: 'change', from: previous?.name, to: next.name, state: ref.getRootState() };
                previous = next;
                record(event);
              } catch (error) { fail(error); }
            };
            observe();
            if (!current() || failed) { settle(); return; }
            const release = ref.addListener('state', observe);
            if (!current() || failed) { try { release(); } catch (error) { fail(error); } }
            else { removeListener = release; observe(); status(); }
            settle();
            return;
          }
          if (Date.now() >= deadline) {
            ctx.setStatus({ phase: 'unavailable', issues: [{ path: 'navigation.ref', message: 'Navigation was not ready within 10 seconds.' }] });
            settle(); return;
          }
          timer = setTimeout(poll, 50);
        } catch (error) { fail(error); }
      };
      poll();
      return pending;
    },
  };
};

/** Reset module-level state for testing */
export function _resetNavigationForTesting(): void {
  navigationChannel = createEventChannel<NavigationLogPayload>();
}
