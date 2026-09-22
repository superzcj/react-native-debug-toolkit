import type { ToolkitRuntime } from './runtimeTypes';

interface HostLease {
  owner: symbol;
  runtime: ToolkitRuntime;
}

let active: HostLease | null = null;

export function claimHost(owner: symbol, runtime: ToolkitRuntime): { release(): void } {
  if (active) {
    throw new Error('Debug toolkit host already claimed. Mount only one toolkit host.');
  }
  const lease: HostLease = { owner, runtime };
  active = lease;
  return {
    release() {
      // Identity belongs to this claim, even when a caller reuses its owner symbol.
      if (active === lease) {
        active = null;
        runtime.dispose();
      }
    },
  };
}

export function getActiveRuntime(): ToolkitRuntime | null {
  return active?.runtime ?? null;
}
