import { DebugToolkit } from '../../core/DebugToolkit';
import { createDebugDeviceReport } from '../../utils/deviceReport';
import type { DebugFeature } from '../../types';

function createFeature(name: string, snapshot: unknown): DebugFeature<unknown> {
  return {
    name,
    label: name,
    setup: jest.fn(),
    getSnapshot: () => snapshot,
    cleanup: jest.fn(),
  };
}

describe('createDebugDeviceReport', () => {
  afterEach(() => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('aggregates array snapshots through the feature contract', () => {
    DebugToolkit.addFeature(createFeature('console', [
      { level: 'log', data: ['one'] },
      { level: 'error', data: ['two'] },
    ]));
    DebugToolkit.addFeature(createFeature('environment', { current: 'dev' }));

    const report = createDebugDeviceReport({ maxPerType: 1 });

    expect(report).toEqual({
      version: 2,
      device: {
        platform: 'ios',
        model: 'unknown',
        osVersion: 'unknown',
        appVersion: 'unknown',
      },
      logs: {
        console: [{ level: 'error', data: ['two'] }],
      },
    });
  });

  it('honors includeTypes', () => {
    DebugToolkit.addFeature(createFeature('console', [{ level: 'error' }]));
    DebugToolkit.addFeature(createFeature('network', [{ request: { url: '/api' } }]));

    const report = createDebugDeviceReport({ includeTypes: ['network'] });

    expect(Object.keys(report.logs)).toEqual(['network']);
  });

  it('safely serializes circular bodies and truncates large payloads', () => {
    const circular: Record<string, unknown> = { name: 'demo' };
    circular.self = circular;
    DebugToolkit.addFeature(createFeature('network', [
      {
        request: {
          url: '/large',
          body: { circular, text: 'x'.repeat(200) },
        },
      },
    ]));

    const report = createDebugDeviceReport({ maxBodyBytes: 64 });
    const entry = report.logs.network?.[0] as {
      request: { body: { __debugToolkitTruncated: boolean; preview: string } };
    };

    expect(entry.request.body.__debugToolkitTruncated).toBe(true);
    expect(entry.request.body.preview).toContain('[Circular]');
  });
});
