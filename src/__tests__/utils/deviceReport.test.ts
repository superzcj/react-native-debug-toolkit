import { createDebugDeviceReport, sanitizeDebugLogEntry } from '../../utils/deviceReport';
import type { DebugFeature } from '../../types';

function createFeature(name: string, snapshot: unknown): DebugFeature<unknown> {
  return {
    name,
    label: name,
    status: { phase: 'ready', issues: [] },
    setup: jest.fn(),
    getSnapshot: () => snapshot,
    cleanup: jest.fn(),
  };
}

describe('createDebugDeviceReport', () => {
  let features: DebugFeature<unknown>[] = [];
  const featureProvider = { get features() { return features; }, subscribe: () => () => {} };
  afterEach(() => {
    features = [];
  });

  it('aggregates array snapshots through the feature contract', () => {
    features.push(createFeature('console', [
      { level: 'log', data: ['one'] },
      { level: 'error', data: ['two'] },
    ]));
    features.push(createFeature('environment', { current: 'dev' }));

    const report = createDebugDeviceReport({ featureProvider, maxPerType: 1 });

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
    features.push(createFeature('console', [{ level: 'error' }]));
    features.push(createFeature('network', [{ request: { url: '/api' } }]));

    const report = createDebugDeviceReport({ featureProvider, includeTypes: ['network'] });

    expect(Object.keys(report.logs)).toEqual(['network']);
  });

  it('safely serializes circular bodies and truncates large payloads', () => {
    const circular: Record<string, unknown> = { name: 'demo' };
    circular.self = circular;
    features.push(createFeature('network', [
      {
        request: {
          url: '/large',
          body: { circular, text: 'x'.repeat(200) },
        },
      },
    ]));

    const report = createDebugDeviceReport({ featureProvider, maxBodyBytes: 64 });
    const entry = report.logs.network?.[0] as {
      request: { body: { __debugToolkitTruncated: boolean; preview: string } };
    };

    expect(entry.request.body.__debugToolkitTruncated).toBe(true);
    expect(entry.request.body.preview).toContain('[Circular]');
  });

  it('exposes the same body/data sanitizer for persisted network logs', () => {
    const entry = sanitizeDebugLogEntry({
      request: { body: 'x'.repeat(512) },
      response: { data: 'y'.repeat(512) },
    }, 64) as {
      request: { body: string };
      response: { data: string };
    };

    expect(entry.request.body).toContain('[truncated]');
    expect(entry.response.data).toContain('[truncated]');
  });
});
