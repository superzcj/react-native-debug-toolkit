import { NativeModules } from 'react-native';

import { buildMetroTarget } from './devConnectUtils';

export interface NativeDiagnostics {
  log: string[];
  swizzleInstalled: boolean;
  swizzleInvoked: boolean;
  persistedMetroHost: string | null;
}

interface DebugToolkitDevConnectNativeModule {
  applyMetroHost: (hostPort: string) => Promise<{ hostPort?: string } | void>;
  resetMetroHost: () => Promise<void>;
  getMetroHost?: () => Promise<string | null>;
  getLocalIp?: () => Promise<string | null>;
  isDebugBuild?: () => Promise<boolean>;
  getPreference?: (key: string) => Promise<string | null>;
  getDiagnostics?: () => Promise<NativeDiagnostics>;
  clearDiagnostics?: () => Promise<void>;
}

type MetroBundleFailureReason =
  | 'invalid_target'
  | 'native_unavailable'
  | 'fetch_unavailable'
  | 'metro_unreachable'
  | 'native_error';

export type MetroBundleResult =
  | { ok: true; hostPort: string }
  | { ok: false; reason: MetroBundleFailureReason; error?: string; statusUrl?: string };

type FetchLike = (
  url: string,
  init: { method: string },
) => Promise<{
  ok?: boolean;
  text?: () => Promise<string>;
}>;

function getNativeModule(): DebugToolkitDevConnectNativeModule | null {
  const nativeModule = NativeModules.DebugToolkitDevConnect as Partial<DebugToolkitDevConnectNativeModule> | undefined;
  if (
    nativeModule &&
    typeof nativeModule.applyMetroHost === 'function' &&
    typeof nativeModule.resetMetroHost === 'function'
  ) {
    return nativeModule as DebugToolkitDevConnectNativeModule;
  }
  return null;
}

export function isNativeDevConnectAvailable(): boolean {
  return getNativeModule() !== null;
}

async function checkMetroStatus(statusUrl: string): Promise<MetroBundleResult | null> {
  const fetchImpl = globalThis.fetch as FetchLike | undefined;
  if (!fetchImpl) {
    return {
      ok: false,
      reason: 'fetch_unavailable',
      statusUrl,
      error: 'global fetch is not available',
    };
  }

  try {
    const response = await fetchImpl(statusUrl, { method: 'GET' });
    const body = typeof response.text === 'function' ? await response.text() : '';
    if (response.ok === false || !body.includes('packager-status:running')) {
      return {
        ok: false,
        reason: 'metro_unreachable',
        statusUrl,
        error: body || 'Metro status endpoint did not report running',
      };
    }
    return null;
  } catch (error) {
    return {
      ok: false,
      reason: 'metro_unreachable',
      statusUrl,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function applyMetroBundle(host: string, port: string): Promise<MetroBundleResult> {
  const target = buildMetroTarget(host, port);
  if (!target) {
    return { ok: false, reason: 'invalid_target' };
  }

  const nativeModule = getNativeModule();
  if (!nativeModule) {
    return { ok: false, reason: 'native_unavailable' };
  }

  const statusError = await checkMetroStatus(target.statusUrl);
  if (statusError) {
    return statusError;
  }

  try {
    const result = await nativeModule.applyMetroHost(target.hostPort);
    return {
      ok: true,
      hostPort: result && typeof result.hostPort === 'string' ? result.hostPort : target.hostPort,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'native_error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function resetMetroBundle(): Promise<MetroBundleResult | { ok: true }> {
  const nativeModule = getNativeModule();
  if (!nativeModule) {
    return { ok: false, reason: 'native_unavailable' };
  }

  try {
    await nativeModule.resetMetroHost();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'native_error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

export async function getNativeDiagnostics(): Promise<NativeDiagnostics | null> {
  const nativeModule = getNativeModule();
  if (!nativeModule?.getDiagnostics) {
    return null;
  }
  try {
    return await nativeModule.getDiagnostics();
  } catch {
    return null;
  }
}

export async function clearNativeDiagnostics(): Promise<void> {
  const nativeModule = getNativeModule();
  if (!nativeModule?.clearDiagnostics) {
    return;
  }
  try {
    await nativeModule.clearDiagnostics();
  } catch {
    // best-effort
  }
}
