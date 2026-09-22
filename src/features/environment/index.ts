import { EnvironmentTab } from './EnvironmentTab';
import { normalizeEnvironment } from './environmentConfig';
import { buildEnvironmentUrlRewriter } from './urlPrefixRewrite';
import type { DebugFeature, DebugFeatureListener } from '../../types/feature';
import type { EnvironmentOptions, EnvironmentState } from '../../types/environment';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';
import type { ConfigIssue } from '../../core/config';
import type { LogRuntimeContext } from '../../utils/logRuntime';
import { KEYS } from '../../utils/debugPreferences';
import { acquireRewriter } from '../../utils/xhrService';

export interface EnvironmentFeatureAPI extends DebugFeature<EnvironmentState>, FeatureDriver {
  switchEnvironment(environmentId: string): Promise<void>;
  restoreDefaultEnvironment(): Promise<void>;
  getCurrentEnvironmentId(): string | null;
}

export const createEnvironmentFeature = (
  options: EnvironmentOptions | undefined,
  runtime: LogRuntimeContext,
): EnvironmentFeatureAPI => {
  // Root normalization uses null to represent an empty default selection.
  const config = normalizeEnvironment(options ? { ...options, defaultId: options.defaultId ?? undefined } : undefined);
  const listeners = new Set<DebugFeatureListener>();
  let context: FeatureContext | undefined;
  let active = false;
  let token = 0;
  let busy = false;
  let error: string | null = null;
  let selection: string | null = null;
  let release: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  const current = () => active && runtime.active && !!context && context.isCurrent() && !context.signal.aborted;
  const notify = () => { listeners.forEach(listener => listener()); };
  const publish = (issues: readonly ConfigIssue[] = []) => {
    if (current()) { context!.setStatus({ phase: issues.length ? 'error' : config.items.length ? 'ready' : 'empty', issues }); }
    notify();
  };
  const apply = (id: string | null) => {
    release?.(); release = undefined;
    const rewrite = buildEnvironmentUrlRewriter(
      config.items.find(item => item.id === config.defaultId) ?? null,
      config.items.find(item => item.id === id) ?? null,
    );
    if (rewrite && current()) { release = acquireRewriter(context!.owner, rewrite); }
    selection = id;
  };
  const select = async (id: string, persist: boolean, initializing = false) => {
    if (!current() || (!initializing && busy)) { return; }
    const target = config.items.find(item => item.id === id);
    if (!target || (!initializing && id === selection && !error)) { return; }
    const generation = ++token;
    const previous = initializing ? config.defaultId : selection;
    const valid = () => current() && generation === token;
    busy = true; error = null;
    try {
      apply(id); notify();
      await options?.onChange?.(target);
      if (!valid()) { return; }
      if (persist) { await runtime.preferenceStorage.setItem(KEYS.environmentId, id); }
      if (!valid()) { return; }
      publish();
    } catch (cause) {
      if (!valid()) { return; }
      error = cause instanceof Error ? cause.message : String(cause);
      try { apply(previous); } catch { selection = previous; }
      publish([{ path: 'environment.onChange', message: error }]);
    } finally {
      if (valid()) { busy = false; notify(); }
    }
  };
  const dispose = () => {
    if (!active) { return; }
    active = false; ++token;
    context?.signal.removeEventListener('abort', dispose);
    release?.(); release = undefined;
    selection = null; busy = false;
    notify();
  };
  const start = (ctx: FeatureContext): Promise<void> | void => {
    if (pending || active) { return pending; }
    if (ctx.signal.aborted || !ctx.isCurrent()) { return; }
    context = ctx; active = true;
    ctx.signal.addEventListener('abort', dispose, { once: true });
    if (config.issues.length) { publish(config.issues); return; }
    if (!config.items.length) { publish(); return; }
    busy = true; notify();
    pending = (async () => {
      let saved: string | null = null;
      try { saved = await runtime.preferenceStorage.getItem(KEYS.environmentId); }
      catch { /* Preferences are optional; use the declared default. */ }
      if (!current()) { return; }
      const id = config.items.some(item => item.id === saved) ? saved : config.defaultId;
      if (id) { await select(id, false, true); }
    })();
    return pending;
  };
  return {
    name: 'environment', label: 'Environment', renderContent: EnvironmentTab,
    setup() {
      const controller = new AbortController();
      start({ owner: Symbol('environment'), signal: controller.signal, isCurrent: () => true, setStatus() {} });
    },
    start, dispose, cleanup: dispose,
    getSnapshot: () => ({ environments: config.items, currentEnvironmentId: selection, defaultEnvironmentId: config.defaultId, busy, error }),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    switchEnvironment: id => select(id, true),
    restoreDefaultEnvironment: () => config.defaultId ? select(config.defaultId, true) : Promise.resolve(),
    getCurrentEnvironmentId: () => selection,
    badge() {
      const item = config.items.find(env => env.id === selection);
      return item ? { label: item.title.substring(0, 3).toUpperCase(), color: '#FF9500' } : null;
    },
  };
};
