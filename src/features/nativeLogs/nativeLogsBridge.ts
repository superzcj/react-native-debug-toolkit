import { NativeModules } from 'react-native';
import type { NativeLogEntry } from '../../types';

interface NativeLogsModule {
  startCapture?: (options?: Record<string, unknown>) => Promise<{ ok: boolean }>;
  stopCapture?: () => Promise<{ ok: boolean }>;
  drainLogs?: (max?: number) => Promise<Array<Omit<NativeLogEntry, 'id'>>>;
  getStatus?: () => Promise<{ available: boolean; capturing: boolean; error?: string }>;
}

function getNativeModule(): NativeLogsModule | null {
  const mod = NativeModules.DebugToolkitNativeLogs as NativeLogsModule | undefined;
  if (!mod || typeof mod.drainLogs !== 'function') return null;
  return mod;
}

export function isNativeLogsAvailable(): boolean {
  return getNativeModule() !== null;
}

export async function startNativeLogCapture(options?: Record<string, unknown>): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.startCapture) return false;
  try { const r = await mod.startCapture(options ?? {}); return r?.ok === true; }
  catch { return false; }
}

export async function stopNativeLogCapture(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.stopCapture) return false;
  try { const r = await mod.stopCapture(); return r?.ok === true; }
  catch { return false; }
}

export async function drainNativeLogs(max = 100): Promise<Array<Omit<NativeLogEntry, 'id'>>> {
  const mod = getNativeModule();
  if (!mod?.drainLogs) return [];
  try { const entries = await mod.drainLogs(Math.max(1, Math.floor(max))); return Array.isArray(entries) ? entries : []; }
  catch { return []; }
}

export async function getNativeLogsStatus(): Promise<{ available: boolean; capturing: boolean; error?: string }> {
  const mod = getNativeModule();
  if (!mod?.getStatus) return { available: false, capturing: false };
  try {
    const s = await mod.getStatus();
    return { available: s?.available === true, capturing: s?.capturing === true, error: typeof s?.error === 'string' ? s.error : undefined };
  } catch (error) {
    return { available: true, capturing: false, error: error instanceof Error ? error.message : String(error) };
  }
}
