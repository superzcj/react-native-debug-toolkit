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

// Hooks
export { useNavigationLogger } from './features/navigation/useNavigationLogger';

// Utilities
export { safeStringify } from './utils/safeStringify';
export { copyToComputer, logToComputer, fmt } from './utils/copyToComputer';
export type { CopyResult, CopyOptions, CopyMethod } from './utils/copyToComputer';
export { createDebugSessionReport } from './utils/sessionReport';
export type { DebugSessionReport, DebugSessionReportOptions } from './utils/sessionReport';
export { getDefaultDaemonEndpoint, reportDebugSessionToDaemon } from './utils/reportToDaemon';
export type { ReportResult, ReportToDaemonOptions } from './utils/reportToDaemon';
export { checkDaemonConnection } from './utils/daemonConnection';
export type {
  DaemonConnectionFailureReason,
  DaemonConnectionOptions,
  DaemonConnectionResult,
} from './utils/daemonConnection';
export { startStreaming, stopStreaming, isStreaming } from './utils/streamToDaemon';
export type { StreamStatus, StreamToDaemonOptions } from './utils/streamToDaemon';
export { autoDetectDaemonIp, getMetroHost } from './utils/autoDetectDaemon';
export type { AutoDetectOptions, AutoDetectResult } from './utils/autoDetectDaemon';

// Types
export type {
  AnyDebugFeature,
  BuiltInFeatureName,
  DebugFeature,
  DebugFeatureRenderProps,
  NetworkLogEntry,
  ConsoleLogEntry,
  ZustandLogEntry,
  NavigationLogEntry,
  TrackLogEntry,
  EnvironmentConfig,
  EnvironmentState,
} from './types';

// Default export for convenience
export { initializeDebugToolkit as default } from './core/initialize';
