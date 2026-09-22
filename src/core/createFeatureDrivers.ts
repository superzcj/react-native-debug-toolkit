import type { DebugFeature, FeatureDataProvider } from '../types/feature';
import type { DebugActions, FeatureStatus } from '../types/debug';
import type { FeatureContext, FeatureDriver, RuntimeDependencies } from './runtimeTypes';
import type { FeatureKey } from './featureCatalog';
import { FEATURE_LABELS } from './featureCatalog';
import type { LogRuntimeContext } from '../utils/logRuntime';
import { createNetworkFeature } from '../features/network';
import { createConsoleLogFeature } from '../features/console';
import { createNativeLogsFeature } from '../features/nativeLogs';
import { createStateFeature } from '../features/state';
import { createNavigationLogFeature } from '../features/navigation';
import { createTrackFeature } from '../features/track';
import { createDevConnectFeature } from '../features/devConnect';
import { createClipboardFeature } from '../features/clipboard';
import { createSessionHistoryFeature } from '../features/sessionHistory';
import { createEnvironmentFeature } from '../features/environment';
import { createQuickAccountsFeature } from '../features/quickAccounts/createQuickAccountsFeature';
import { createTabsFeature } from '../features/tabs';
import { HubClient } from '../utils/HubClient';
import { copyToComputer, phoneCopyChannel } from '../utils/copyToComputer';
import type { ConsoleLogEntry } from '../types/logs';

export interface FeatureDriverBinding extends FeatureDriver {
  feature: DebugFeature<any>;
  actions: Partial<DebugActions>;
}

/** One registry per host. All captured instances use the supplied log runtime. */
export function createFeatureDrivers(services: {
  logs: LogRuntimeContext;
  debugBuild: boolean;
  panel: { open(): void; close(): void };
}): RuntimeDependencies['createDriver'] {
  const features = new Map<FeatureKey, DebugFeature<any>>();
  let consoleFeature: ReturnType<typeof createConsoleLogFeature> | undefined;
  let hubClient: HubClient | undefined;
  const copy: DebugActions['copyToComputer'] = (text, options) => {
    let entry: ConsoleLogEntry | undefined;
    return copyToComputer(text, {
      ...options, enabled: services.logs.active,
      channels: {
        copyPhone: services.logs.active ? phoneCopyChannel() : undefined,
        recordConsole: consoleFeature ? (content, label) => { entry = consoleFeature!.record(content, label); } : undefined,
        sendHub: hubClient ? (content, label) => hubClient!.sendCopy(content, label, entry) : undefined,
      },
    });
  };
  const provider: FeatureDataProvider = {
    get features() { return [...features.values()]; },
    subscribe: () => () => {},
  };
  return config => {
    const options = config.options;
    let feature: DebugFeature<any> & Partial<FeatureDriver>;
    const actions: Partial<DebugActions> = {};
    switch (config.key) {
      case 'network': feature = createNetworkFeature(options, services.logs); break;
      case 'console':
        consoleFeature = createConsoleLogFeature(options, services.logs);
        feature = consoleFeature; break;
      case 'native': feature = createNativeLogsFeature(options, services.logs); break;
      case 'state': {
        const state = createStateFeature(options); feature = state; actions.state = state.record; break;
      }
      case 'navigation': {
        const navigation = createNavigationLogFeature(options); feature = navigation; actions.navigation = navigation.record; break;
      }
      case 'track': {
        const track = createTrackFeature(options, services.logs); feature = track;
        actions.track = (name, data) => track.record({ eventName: name, ...(data === undefined ? {} : { data }) }); break;
      }
      case 'connect':
        hubClient = new HubClient({ featureProvider: provider });
        feature = createDevConnectFeature(options, { client: hubClient, isDebugBuild: services.debugBuild }); break;
      case 'clipboard': feature = createClipboardFeature({}, copy); actions.copyToComputer = copy; break;
      case 'history': feature = createSessionHistoryFeature(services.logs); break;
      case 'environment': feature = createEnvironmentFeature(options, services.logs); break;
      case 'accounts': {
        const accounts = createQuickAccountsFeature(options, { preferenceStorage: services.logs.preferenceStorage,
          get active() { return services.logs.active; }, closePanel: services.panel.close });
        feature = accounts; actions.accounts = accounts.actions; break;
      }
      case 'tabs': feature = createTabsFeature(options); break;
    }
    feature.name = config.key;
    Object.defineProperty(feature, 'label', { configurable: true, value: FEATURE_LABELS[config.key] });
    features.set(config.key, feature);
    let context: FeatureContext | undefined;
    let live = false;
    let releaseSnapshot: (() => void) | undefined;
    let releaseCapabilities: (() => void) | undefined;
    let status: FeatureStatus = { phase: 'initializing', issues: [] };
    Object.defineProperty(feature, 'status', { configurable: true, get: () => status });
    const current = () => live && services.logs.active && !!context?.isCurrent() && !context.signal.aborted;
    const publish = (next: FeatureStatus) => {
      if (!current()) { return; }
      status = next; context!.setStatus(next);
    };
    const updateLegacyStatus = () => {
      if (!current()) { return; }
      const issues = services.logs.getCapabilityIssues().filter(issue => issue.path === config.key);
      if (issues.length) { publish({ phase: 'unavailable', issues }); return; }
      if (feature.start) { return; }
      const snapshot = feature.getSnapshot();
      publish({ phase: Array.isArray(snapshot) && !snapshot.length ? 'empty' : 'ready', issues: [] });
    };
    const binding: FeatureDriverBinding = {
      feature, actions,
      async start(ctx) {
        if (live || ctx.signal.aborted || !ctx.isCurrent()) { return; }
        context = ctx; live = true;
        releaseCapabilities = services.logs.subscribeCapabilities(updateLegacyStatus);
        releaseSnapshot = feature.subscribe?.(updateLegacyStatus);
        if (feature.start) { await feature.start({ ...ctx, setStatus: publish }); }
        else { await feature.setup(); }
        updateLegacyStatus();
      },
      dispose() {
        live = false;
        releaseSnapshot?.(); releaseCapabilities?.();
        releaseSnapshot = undefined; releaseCapabilities = undefined;
        if (feature.dispose) { feature.dispose(); } else { feature.cleanup(); }
      },
    };
    return binding;
  };
}
