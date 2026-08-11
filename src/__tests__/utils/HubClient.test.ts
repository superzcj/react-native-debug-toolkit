import { HubClient } from '../../utils/HubClient';
import type { FeatureDataProvider } from '../../types';
import { computeHubPayloadHash } from '../../utils/hubCanonical';

function response(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

function createFeatureProvider(): FeatureDataProvider {
  return {
    features: [],
    subscribe: () => () => undefined,
  };
}

describe('HubClient transport', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('matches the Hub canonical payload-hash vector', () => {
    expect(computeHubPayloadHash({
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      sequence: 1,
      timestamp: 1700000000000,
      type: 'toolkit.manual_sync',
      severity: 'info',
      data: { trigger: 'button', nested: { z: 1, a: '中文' } },
    })).toBe('74f9634aa3ce38326221e62fc41cef22de1e678eeab72df37f56de85663efa47');
  });

  it('sends a canonical payload hash for each numbered event', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
        hubRef: 'ABCDEF',
        sessionRef: '1234',
        generation: 'generation',
        deviceId: 'ios-test',
        expectedSequence: 1,
      }))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        ackThrough: 1,
        expectedSequence: 2,
        rejected: [],
      }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    await flushPromises();
    await client.syncNow();

    const request = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(request.events[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
    client.disconnect();
  });

  it('retries the same in-flight batch after a transient events failure', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
        hubRef: 'ABCDEF',
        sessionRef: '1234',
        generation: 'generation',
        deviceId: 'ios-test',
        expectedSequence: 1,
      }))
      .mockResolvedValueOnce(response(503, { ok: false }))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        ackThrough: 1,
        expectedSequence: 2,
        rejected: [],
      }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    await flushPromises();
    await client.syncNow();
    expect(fetch).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(1000);

    expect(fetch).toHaveBeenCalledTimes(3);
    const firstAttempt = JSON.parse(fetch.mock.calls[1]![1].body);
    const retry = JSON.parse(fetch.mock.calls[2]![1].body);
    expect(retry.firstSequence).toBe(firstAttempt.firstSequence);
    expect(retry.events).toEqual(firstAttempt.events);
    client.disconnect();
  });
});
