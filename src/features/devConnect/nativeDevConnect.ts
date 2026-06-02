import { NativeModules } from 'react-native';

interface DebugToolkitDevConnectNativeModule {
  getLocalIp?: () => Promise<string | null>;
  isDebugBuild?: () => Promise<boolean>;
  getPreference?: (key: string) => Promise<string | null>;
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

export async function getDeviceLocalIp(): Promise<string | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule?.getLocalIp) {
    return null;
  }
  try {
    const ip = await nativeModule.getLocalIp();
    return typeof ip === 'string' ? ip : null;
  } catch {
    return null;
  }
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
