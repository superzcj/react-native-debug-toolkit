import type { AnyDebugFeature, FeatureDataProvider } from '../types/feature';
import type { DebugActions, DebugReport, FeatureStatus, ReadyResult } from '../types/debug';
import type { ToolkitRuntime, RuntimeDependencies } from './runtimeTypes';
import type { FeatureKey } from './featureCatalog';
import { FEATURE_KEYS, FEATURE_LABELS, LOG_FEATURE_KEYS } from './featureCatalog';
import { normalizeConfig } from './config';
import { createToolkitRuntime } from './runtime';
import { createFeatureDrivers, type FeatureDriverBinding } from './createFeatureDrivers';
import { nativeIsDebugBuild } from '../features/devConnect/nativeDevConnect';
import { createLogRuntime, type LogRuntimeContext } from '../utils/logRuntime';
import { createDefaultLogStorage } from '../utils/StorageAdapter';
import { bindPreferenceStorage } from '../utils/debugPreferences';
import { configureLocale } from '../i18n';
import { copyToComputer } from '../utils/copyToComputer';
import { sanitizeDebugLogEntry } from '../utils/deviceReport';

const originalConsoleError = console.error.bind(console);

export interface ToolkitHostSnapshot {
  features: AnyDebugFeature[];
  panelOpen: boolean;
}
export interface ToolkitHost extends ToolkitRuntime, FeatureDataProvider {
  readonly actions: DebugActions;
  getSnapshot(): ToolkitHostSnapshot;
}

/** Internal assembly entry. It allocates no storage, collectors or native work until start. */
export function createToolkitHost(input?: unknown): ToolkitHost {
  const config = normalizeConfig(input);
  const lifetime = new AbortController();
  const listeners = new Set<() => void>();
  const pages = new Map<FeatureKey, AnyDebugFeature>();
  const bindings = new Map<FeatureKey, FeatureDriverBinding>();
  let states: Partial<Record<FeatureKey, FeatureStatus>> = {};
  let snapshot: ToolkitHostSnapshot = { features: [], panelOpen: false };
  let result: ReadyResult = { status: 'not_started', features: {}, issues: [] };
  let started = false;
  let disposed = false;
  let logs: LogRuntimeContext | undefined;
  let nativeDetection: Promise<boolean | undefined> | undefined;
  let nativeDebug: boolean | undefined;
  let initialize: Promise<void> | undefined;
  let drivers: RuntimeDependencies['createDriver'] | undefined;
  let releasePreferences: (() => void) | undefined;
  let ready: Promise<ReadyResult> | undefined;
  const fallbackDev = typeof __DEV__ === 'boolean' ? __DEV__ : undefined;
  const usable = () => !disposed && !lifetime.signal.aborted && (result.status === 'ready' || result.status === 'partial');
  const emit = () => { listeners.forEach(listener => { try { listener(); } catch { /* Observers cannot stop host cleanup. */ } }); };
  const detect = () => {
    nativeDetection ??= nativeIsDebugBuild().then(value => {
      if (!lifetime.signal.aborted) { nativeDebug = value ?? undefined; }
      return value ?? undefined;
    });
    return nativeDetection;
  };
  const releaseServices = () => {
    lifetime.abort(); logs?.dispose(); releasePreferences?.(); releasePreferences = undefined;
  };
  const panel = {
    open() {
      if (disposed || !snapshot.features.length || snapshot.panelOpen) { return; }
      snapshot = { ...snapshot, panelOpen: true }; emit();
    },
    close() {
      if (!snapshot.panelOpen) { return; }
      snapshot = { ...snapshot, panelOpen: false }; emit();
    },
  };
  const startServices = () => {
    if (!initialize) {
      logs = createLogRuntime({
        history: { enabled: config.features.history.enabled && !config.features.history.issues.length,
          maxSessions: config.features.history.options.maxSessions as number },
        logDisk: createDefaultLogStorage(), preferenceDisk: createDefaultLogStorage(),
      });
      releasePreferences = bindPreferenceStorage(logs.preferenceStorage);
      initialize = Promise.all([detect(), logs.initialize(lifetime.signal)]).then(() => {
        if (disposed || lifetime.signal.aborted) { return; }
        configureLocale(config.locale);
        drivers = createFeatureDrivers({ logs: logs!, debugBuild: nativeDebug ?? fallbackDev ?? false, panel });
      });
    }
    return initialize;
  };
  const runtime = createToolkitRuntime(config, {
    detectDebugBuild: () => detect(), fallbackDev,
    publish(next) {
      if (disposed) { return; }
      states = next;
      snapshot = { ...snapshot, features: FEATURE_KEYS.filter(key => !!states[key]).map(key => {
        let page = pages.get(key);
        if (!page) {
          page = {
            name: key, label: FEATURE_LABELS[key], get status() { return states[key]!; },
            setup() {}, cleanup() {}, getSnapshot: () => [],
          };
          pages.set(key, page);
        }
        return page;
      }) };
      emit();
    },
    createDriver(feature) {
      let binding: FeatureDriverBinding | undefined;
      return {
        async start(context) {
          await startServices();
          if (disposed || !context.isCurrent() || context.signal.aborted || !drivers) { return; }
          binding = drivers(feature) as FeatureDriverBinding;
          if (!context.isCurrent() || context.signal.aborted) { binding.dispose(); return; }
          bindings.set(feature.key, binding);
          const page = binding.feature;
          Object.defineProperty(page, 'status', { configurable: true, get: () => states[feature.key]! });
          pages.set(feature.key, page);
          snapshot = { ...snapshot, features: snapshot.features.map(existing => existing.name === feature.key ? page : existing) };
          emit();
          if (!context.isCurrent() || context.signal.aborted) { return; }
          await binding.start(context);
        },
        dispose() { binding?.dispose(); },
      };
    },
  });
  const actions: DebugActions = {
    ready: () => host.ready,
    open: panel.open, close: panel.close,
    clear(key) {
      if (!usable()) { return; }
      for (const feature of LOG_FEATURE_KEYS) {
        if (key === undefined || key === feature) { bindings.get(feature)?.feature.clear?.(); }
      }
    },
    track: (name, data) => { if (usable()) { bindings.get('track')?.actions.track?.(name, data); } },
    state: (id, event) => { if (usable()) { bindings.get('state')?.actions.state?.(id, event); } },
    navigation: event => { if (usable()) { bindings.get('navigation')?.actions.navigation?.(event); } },
    copyToComputer: (text, options) => usable() && bindings.get('clipboard')?.actions.copyToComputer
      ? bindings.get('clipboard')!.actions.copyToComputer!(text, options)
      : copyToComputer(text, { ...options, enabled: false, channels: {} }),
    getReport() {
      const report: DebugReport = { status: result.status, features: {}, logs: {} };
      if (disposed || !snapshot.features.length) { return report; }
      report.features = Object.fromEntries(Object.entries(states).map(([key, status]) => [key, {
        phase: status.phase, issues: status.issues.map(issue => ({ ...issue })),
      }]));
      for (const key of LOG_FEATURE_KEYS) {
        const feature = bindings.get(key)?.feature;
        if (feature) { report.logs[key] = sanitizeDebugLogEntry(feature.getSnapshot()) as readonly unknown[]; }
      }
      const connect = bindings.get('connect')?.feature.getSnapshot();
      if (connect?.appId) { report.appId = connect.appId; }
      if (logs) { report.sessionId = logs.sessionManager.getCurrentSession().id; }
      return report;
    },
    accounts: {
      switchTo: id => usable() ? bindings.get('accounts')?.actions.accounts?.switchTo(id) ?? Promise.resolve({ status: 'disabled' }) : Promise.resolve({ status: 'disabled' }),
      suspend: () => { if (usable()) { bindings.get('accounts')?.actions.accounts?.suspend(); } },
      resume: () => { if (usable()) { bindings.get('accounts')?.actions.accounts?.resume(); } },
      waitForIdle: () => bindings.get('accounts')?.actions.accounts?.waitForIdle() ?? Promise.resolve(),
    },
  };
  const host: ToolkitHost = {
    actions,
    get features() { return snapshot.features; },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    get ready() { return ready ?? runtime.ready; },
    start() {
      if (started || disposed) { return; }
      started = true; runtime.start();
      ready = runtime.ready.then(next => {
        if (!disposed) { result = next; }
        if (next.status === 'error' && config.issues.length) {
          try { originalConsoleError('[DebugToolkit] Invalid configuration:', config.issues); } catch { /* Diagnostics cannot break the App. */ }
        }
        if (next.status === 'initialization_timeout' || next.status === 'error' || next.status === 'cancelled') { releaseServices(); }
        return next;
      });
    },
    dispose() {
      if (disposed) { return; }
      disposed = true; releaseServices(); runtime.dispose();
      result = { status: 'cancelled', features: {}, issues: [] };
      snapshot = { features: [], panelOpen: false }; emit(); listeners.clear();
    },
  };
  return host;
}
