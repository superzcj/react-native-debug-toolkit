import type { NormalizedFeature } from './config';
import type { FeatureKey } from './featureCatalog';
import type { FeatureStatus, ReadyResult } from '../types/debug';

export type { FeaturePhase, FeatureStatus, ReadyResult } from '../types/debug';

export interface FeatureContext {
  readonly owner: symbol;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  setStatus(status: FeatureStatus): void;
}

export interface FeatureDriver {
  start(context: FeatureContext): void | Promise<void>;
  dispose(): void;
}

export interface RuntimeDependencies {
  detectDebugBuild(signal: AbortSignal): Promise<boolean | undefined>;
  fallbackDev: boolean | undefined;
  createDriver(config: NormalizedFeature): FeatureDriver;
  publish(features: Partial<Record<FeatureKey, FeatureStatus>>): void;
}

export interface ToolkitRuntime {
  readonly ready: Promise<ReadyResult>;
  start(): void;
  dispose(): void;
}
