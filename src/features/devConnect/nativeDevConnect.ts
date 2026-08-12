import { NativeModules } from 'react-native';

interface DebugToolkitDevConnectNativeModule {
  isDebugBuild?: () => Promise<boolean>;
  getPreference?: (key: string) => Promise<string | null>;
  getAppInfo?: () => Promise<NativeAppInfo | null>;
}

export interface NativeAppInfo {
  nativeApplicationId?: string;
  manufacturer?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  buildNumber?: string;
}

function getNativeModule(): DebugToolkitDevConnectNativeModule | null {
  const nativeModule = NativeModules.DebugToolkitDevConnect as Partial<DebugToolkitDevConnectNativeModule> | undefined;
  if (nativeModule && typeof nativeModule.isDebugBuild === 'function') {
    return nativeModule as DebugToolkitDevConnectNativeModule;
  }
  return null;
}

export function isNativeDevConnectAvailable(): boolean {
  return getNativeModule() !== null;
}

export async function nativeIsDebugBuild(): Promise<boolean | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule?.isDebugBuild) {
    return null;
  }
  try {
    const result = await nativeModule.isDebugBuild();
    return typeof result === 'boolean' ? result : null;
  } catch {
    return null;
  }
}

export async function getNativeAppInfo(): Promise<NativeAppInfo | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule?.getAppInfo) return null;
  try {
    const info = await nativeModule.getAppInfo();
    return info && typeof info === 'object' ? info : null;
  } catch {
    return null;
  }
}
