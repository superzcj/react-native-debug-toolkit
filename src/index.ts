// Core
export { DebugToolkit } from './core/DebugToolkit';
export { DebugToolkitProvider, useDebugToolkit } from './core/DebugToolkitProvider';
export { DebugView } from './ui/DebugView';
export type { DebugViewProps } from './ui/DebugView';
export { initializeDebugToolkit } from './core/initialize';
export type { InitializeOptions, FeatureConfigs } from './core/initialize';

// Feature factories
export { createNetworkFeature } from './features/network';
export type { NetworkFeatureConfig, AxiosInstanceLike } from './features/network';
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
