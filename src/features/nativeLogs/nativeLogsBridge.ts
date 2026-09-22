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
  if (!mod || typeof mod.drainLogs !== 'function' || typeof mod.startCapture !== 'function' || typeof mod.stopCapture !== 'function') return null;
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


interface CaptureState {
  owners: Set<symbol>;
  capturing: boolean;
  stopping?: Promise<void>;
}
let captureStates = new WeakMap<NativeLogsModule, CaptureState>();

/** A lease owns the right to keep shared native capture running. A stale start
 * may stop capture only when no live lease needs it. Starts wait for an older
 * asynchronous stop so a retiring owner cannot stop its replacement afterward.
 */
export function acquireNativeLogCapture(): { ready: Promise<boolean>; release(): void } {
  const mod = getNativeModule();
  if (!mod) { return { ready: Promise.resolve(false), release() {} }; }
  let state = captureStates.get(mod);
  if (!state) { state = { owners: new Set(), capturing: false }; captureStates.set(mod, state); }
  const shared = state;
  const owner = Symbol('native-capture');
  shared.owners.add(owner);
  let released = false;
  let started = false;

  function stopIfUnused(): void {
    if (shared.owners.size || shared.stopping || !shared.capturing) { return; }
    shared.capturing = false;
    let result: Promise<unknown>;
    try { result = Promise.resolve(mod!.stopCapture!()); } catch { result = Promise.resolve(); }
    const pending = result.then(() => {}, () => {});
    shared.stopping = pending;
    void pending.then(() => {
      if (shared.stopping === pending) { shared.stopping = undefined; }
      stopIfUnused();
    });
  }

  async function start(): Promise<boolean> {
    if (shared.stopping) { await shared.stopping; }
    if (released) { return false; }
    try {
      // Each feature filters locally; shared capture must not exclude another
      // owner's levels/tags, including when starts complete out of order.
      started = (await mod!.startCapture!({}))?.ok === true;
    } catch { started = false; }
    if (started) { shared.capturing = true; }
    if (released) {
      if (started) { stopIfUnused(); }
      return false;
    }
    if (!started) { shared.owners.delete(owner); stopIfUnused(); }
    return started;
  }

  return {
    ready: start(),
    release() {
      if (released) { return; }
      released = true;
      shared.owners.delete(owner);
      if (started) { stopIfUnused(); }
    },
  };
}

export function resetNativeCaptureOwners(): void {
  captureStates = new WeakMap();
}
