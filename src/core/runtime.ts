import type { ConfigIssue, NormalizedConfig, NormalizedFeature } from './config';
import { FEATURE_KEYS } from './featureCatalog';
import type { FeatureKey } from './featureCatalog';
import type {
  FeatureDriver, FeatureStatus, ReadyResult, RuntimeDependencies, ToolkitRuntime,
} from './runtimeTypes';

// Capture before a console driver can install its collector.
const originalConsoleError = console.error.bind(console);
const INITIALIZATION_DEADLINE_MS = 10_000;

type FeatureStates = Partial<Record<FeatureKey, FeatureStatus>>;
interface DriverEntry {
  controller: AbortController;
  driver?: FeatureDriver;
  disposed: boolean;
}

function reportFailure(error: unknown): void {
  try {
    originalConsoleError('[DebugToolkit] Runtime callback failed:', error);
  } catch {
    // A broken logging sink must not prevent another feature from starting/disposing.
  }
}

export function createToolkitRuntime(
  config: NormalizedConfig,
  deps: RuntimeDependencies,
): ToolkitRuntime {
  const owner = Symbol('toolkit-runtime');
  const detection = new AbortController();
  const entries: DriverEntry[] = [];
  let features: FeatureStates = {};
  let started = false;
  let current = true;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveReady!: (result: ReadyResult) => void;
  const ready = new Promise<ReadyResult>((resolve) => { resolveReady = resolve; });
  const notStarted = Promise.resolve<ReadyResult>({ status: 'not_started', features: {}, issues: [] });

  function settle(status: ReadyResult['status'], issues: readonly ConfigIssue[] = []): void {
    if (settled) {return;}
    settled = true;
    if (timer !== undefined) {clearTimeout(timer);}
    resolveReady({ status, features: { ...features }, issues });
  }

  function disposeEntry(entry: DriverEntry): void {
    if (entry.disposed) {return;}
    entry.disposed = true;
    try { entry.driver?.dispose(); } catch (error) { reportFailure(error); }
  }

  function invalidate(): void {
    // Invalidate first: abort listeners and disposal may synchronously call setStatus.
    current = false;
    detection.abort();
    for (const entry of entries) {entry.controller.abort();}
    for (const entry of [...entries].reverse()) {disposeEntry(entry);}
  }

  function publish(): void {
    if (current) {deps.publish({ ...features });}
  }

  async function startFeature(feature: NormalizedFeature): Promise<void> {
    if (!current || feature.issues.length > 0) {return;}
    const entry: DriverEntry = { controller: new AbortController(), disposed: false };
    entries.push(entry);
    const isCurrent = () => current && !entry.controller.signal.aborted;
    try {
      entry.driver = deps.createDriver(feature);
      if (!isCurrent()) {
        // A factory can synchronously unmount the host before returning its driver.
        entry.disposed = false;
        disposeEntry(entry);
        return;
      }
      await entry.driver.start({
        owner,
        signal: entry.controller.signal,
        isCurrent,
        setStatus(status) {
          if (!isCurrent()) {return;}
          features = { ...features, [feature.key]: { phase: status.phase, issues: [...status.issues] } };
          publish();
        },
      });
      if (!isCurrent()) {return;}
      if (features[feature.key]?.phase === 'initializing') {
        features = { ...features, [feature.key]: { phase: 'ready', issues: [] } };
        publish();
      }
    } catch (error) {
      if (!isCurrent()) {return;}
      entry.controller.abort();
      disposeEntry(entry);
      if (!current) {return;}
      reportFailure(error);
      features = { ...features, [feature.key]: {
        phase: 'error', issues: [{ path: feature.key, message: error instanceof Error ? error.message : String(error) }],
      } };
      publish();
    }
  }

  async function initialize(): Promise<void> {
    if (config.issues.length > 0) {
      settle('error', config.issues);
      return;
    }
    let enabled = config.enabled;
    if (enabled === undefined) {
      let nativeDebug: boolean | undefined;
      try {
        nativeDebug = await deps.detectDebugBuild(detection.signal);
      } catch (error) {
        if (!current || detection.signal.aborted) {return;}
        reportFailure(error);
      }
      if (!current || detection.signal.aborted) {return;}
      enabled = nativeDebug ?? deps.fallbackDev ?? false;
    }
    if (!current) {return;}
    if (!enabled) {
      settle('disabled');
      return;
    }
    const enabledFeatures = FEATURE_KEYS.map((key) => config.features[key]).filter((feature) => feature.enabled);
    // Register all enabled pages atomically, including those with invalid options.
    features = Object.fromEntries(enabledFeatures.map((feature) => [feature.key, {
      phase: feature.issues.length > 0 ? 'error' : 'initializing', issues: [...feature.issues],
    }]));
    publish();
    await Promise.all(enabledFeatures.map(startFeature));
    if (!current) {return;}
    const partial = Object.values(features).some((status) => status.phase === 'error' || status.phase === 'unavailable');
    settle(partial ? 'partial' : 'ready');
  }

  return {
    get ready() {return started || !current ? ready : notStarted;},
    start() {
      if (started || !current) {return;}
      started = true;
      timer = setTimeout(() => {
        if (!current || settled) {return;}
        invalidate();
        const issue = { path: 'initialization', message: 'Toolkit initialization timed out after 10 seconds.' };
        features = Object.fromEntries(Object.entries(features).map(([key, status]) => [key, {
          phase: 'error', issues: [...status.issues, issue],
        }]));
        // One controlled final publication; invalidated continuations cannot publish.
        if (Object.keys(features).length > 0) {
          try { deps.publish({ ...features }); } catch (error) { reportFailure(error); }
        }
        settle('initialization_timeout', [issue]);
      }, INITIALIZATION_DEADLINE_MS);
      void initialize().catch((error: unknown) => {
        if (!current) {return;}
        invalidate();
        reportFailure(error);
        settle('error', [{ path: 'initialization', message: error instanceof Error ? error.message : String(error) }]);
      });
    },
    dispose() {
      if (!current) {return;}
      invalidate();
      settle('cancelled');
    },
  };
}
