// Core
export { DebugToolkit } from './core/DebugToolkit';
export { DebugToolkitProvider, useDebugToolkit } from './core/DebugToolkitProvider';
export { DebugView } from './ui/DebugView';
export type { DebugViewProps } from './ui/DebugView';
export { initializeDebugToolkit } from './core/initialize';
export type { InitializeOptions, FeatureConfigs } from './core/initialize';

// Feature factories
export { createNetworkFeature } from './features/network';
export type { NetworkFeatureConfig } from './features/network';
export { createConsoleLogFeature } from './features/console';
export type { ConsoleFeatureConfig } from './features/console';
export { createZustandLogFeature, zustandLogMiddleware, addZustandLog } from './features/zustand';
export type { ZustandFeatureConfig } from './features/zustand';
export { createNavigationLogFeature, addNavigationLog } from './features/navigation';
export type { NavigationFeatureConfig } from './features/navigation';
export { createTrackFeature, addTrackLog } from './features/track';
export type { TrackFeatureConfig, TrackEventData } from './features/track';
export { createEnvironmentFeature } from './features/environment';
export type { EnvironmentFeatureAPI } from './features/environment';
export { createClipboardFeature } from './features/clipboard';
export { createDevConnectFeature } from './features/devConnect';
export type { DevConnectState } from './features/devConnect';
export { createSessionHistoryFeature } from './features/sessionHistory';
export { createNativeLogsFeature } from './features/nativeLogs';
export type { NativeLogsFeatureConfig } from './features/nativeLogs';

// Hooks
export { useNavigationLogger } from './features/navigation/useNavigationLogger';

// Utilities
export { safeStringify } from './utils/safeStringify';
export { createDebugTab } from './utils/createDebugTab';
export type { CreateDebugTabOptions } from './utils/createDebugTab';
export { copyToComputer, logToComputer, fmt } from './utils/copyToComputer';
export type { CopyResult, CopyOptions, CopyMethod } from './utils/copyToComputer';
export { createDebugDeviceReport } from './utils/deviceReport';
export type { DebugDeviceReport, DebugDeviceReportOptions } from './utils/deviceReport';
export { DaemonClient, daemonClient } from './utils/DaemonClient';
export type {
  DaemonSettings,
  DaemonConnectionMode,
  DaemonConnectionFailureReason,
  DaemonConnectionOptions,
  DaemonConnectionResult,
  StreamStatus,
  StreamToDaemonOptions,
  ReportResult,
  ReportToDaemonOptions,
} from './utils/DaemonClient';
export { getDefaultDaemonEndpoint } from './utils/DaemonClient';
export {
  createDefaultLogStorage,
  MemoryStorageAdapter,
} from './utils/StorageAdapter';
export type { StorageAdapter } from './utils/StorageAdapter';
export type {
  LogFeatureKey,
  LogSession,
  SessionManagerOptions,
} from './utils/SessionManager';

// Types
export type {
  AnyDebugFeature,
  BuiltInFeatureName,
  DebugFeature,
  DebugFeatureListener,
  DebugFeatureRenderProps,
  FeatureDataProvider,
  NetworkLogEntry,
  ConsoleLogEntry,
  NativeLogEntry,
  NativeLogLevel,
  NativeLogSource,
  ZustandLogEntry,
  NavigationLogEntry,
  TrackLogEntry,
  EnvironmentConfig,
  EnvironmentState,
  DebugEnvironment,
  DebugEnvironmentConfig,
  DebugEnvironmentInput,
} from './types';

// Default export for convenience
export { initializeDebugToolkit as default } from './core/initialize';
