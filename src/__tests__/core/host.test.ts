import { createToolkitRuntime } from '../../core/runtime';
import { claimHost, getActiveRuntime } from '../../core/host';
import { normalizeConfig } from '../../core/config';
import type { ToolkitRuntime } from '../../core/runtimeTypes';

function runtime(): ToolkitRuntime {
  return createToolkitRuntime(normalizeConfig({ enabled: false }), {
    detectDebugBuild: jest.fn().mockResolvedValue(false),
    fallbackDev: false,
    createDriver: jest.fn(() => ({ start: jest.fn(), dispose: jest.fn() })),
    publish: jest.fn(),
  });
}

describe('single toolkit host lease', () => {
  test('rejects a second claim with an explicit duplicate host error', () => {
    const owner = Symbol('first');
    const first = runtime();
    const second = runtime();
    const lease = claimHost(owner, first);

    expect(() => claimHost(Symbol('second'), second)).toThrow(/already claimed|duplicate host/i);
    expect(getActiveRuntime()).toBe(first);

    lease.release();
  });

  test('release is idempotent and an old release cannot clear a new lease', () => {
    const firstLease = claimHost(Symbol('first'), runtime());
    const firstRuntime = getActiveRuntime();
    firstLease.release();
    firstLease.release();
    expect(getActiveRuntime()).toBeNull();

    const secondRuntime = runtime();
    const secondLease = claimHost(Symbol('second'), secondRuntime);
    expect(getActiveRuntime()).toBe(secondRuntime);

    firstLease.release();
    expect(getActiveRuntime()).toBe(secondRuntime);

    secondLease.release();
    expect(getActiveRuntime()).toBeNull();
    expect(firstRuntime).not.toBe(secondRuntime);
  });

  test('a release from one owner only releases its own lease', () => {
    const owner = Symbol('owner');
    const toolkit = runtime();
    const lease = claimHost(owner, toolkit);

    expect(getActiveRuntime()).toBe(toolkit);
    lease.release();
    expect(getActiveRuntime()).toBeNull();
  });
});
