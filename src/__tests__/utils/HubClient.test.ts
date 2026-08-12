// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { HubClient } from '../../utils/HubClient';
import type { FeatureDataProvider } from '../../types';
import { computeHubPayloadHash } from '../../utils/hubCanonical';
import {
  _isNetworkUrlBlacklistedForTesting,
  _resetNetworkForTesting,
} from '../../features/network';

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

function createFeatureProviderWithConsoleEntry(): FeatureDataProvider {
  return {
    features: [{
      name: 'console',
      label: 'Console',
      setup: () => undefined,
      cleanup: () => undefined,
      getSnapshot: () => [{
        id: 1,
        timestamp: 1700000000000,
        level: 'info',
        message: 'hello',
      }],
    }],
    subscribe: () => () => undefined,
  };
}

function createFeatureProviderWithFractionalNativeTimestamp(): FeatureDataProvider {
  return {
    features: [{
      name: 'native',
      label: 'Native',
      setup: () => undefined,
      cleanup: () => undefined,
      getSnapshot: () => [{
        id: 1,
        timestamp: 1700000000000.625,
        level: 'warn',
        message: 'native log with sub-millisecond precision',
      }],
    }],
    subscribe: () => () => undefined,
  };
}

describe('HubClient transport', () => {
  afterEach(() => {
    // @ts-expect-error __DEV__ is a React Native global
    global.__DEV__ = true;
    jest.useRealTimers();
    jest.restoreAllMocks();
    _resetNetworkForTesting();
  });

  it('matches the Hub canonical payload-hash vector', () => {
    expect(computeHubPayloadHash({
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      sequence: 1,
      timestamp: 1700000000000,
      type: 'console',
      severity: 'info',
      data: { message: 'hello' },
    })).toBe('d81f12ba4811116fed294e3236a34a341f036a7e05d2e6bdf489656a784cb53b');
  });

  it('excludes the configured Hub origin from captured network logs', () => {
    const client = new HubClient({ fetch: jest.fn(), featureProvider: createFeatureProvider() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });

    expect(_isNetworkUrlBlacklistedForTesting('http://10.20.4.10:3799/api/v1/apps/com.example.audit/sessions'))
      .toBe(true);
  });

  it('sends a canonical payload hash for each numbered event', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
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
    const client = new HubClient({ fetch, featureProvider: createFeatureProviderWithConsoleEntry() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    await flushPromises();
    await client.syncNow();

    const request = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(request.events[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fetch.mock.calls[1]![1].headers).toMatchObject({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });
    client.disconnect();
  });

  it('normalizes fractional native log timestamps before uploading', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
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
    const client = new HubClient({
      fetch,
      featureProvider: createFeatureProviderWithFractionalNativeTimestamp(),
    });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    await flushPromises();
    await client.syncNow();

    const request = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(request.events[0]).toMatchObject({
      type: 'native',
      timestamp: 1700000000000,
    });
    client.disconnect();
  });

  it('uploads one snapshot and returns to paused in a release build', async () => {
    // @ts-expect-error __DEV__ is a React Native global
    global.__DEV__ = false;
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
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
    const client = new HubClient({ fetch, featureProvider: createFeatureProviderWithConsoleEntry() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    await client.syncNow();

    const eventRequest = fetch.mock.calls.find(([url, init]) =>
      String(url).includes('/events') && init?.method === 'POST',
    );
    expect(eventRequest).toBeDefined();
    expect(JSON.parse(eventRequest![1]!.body).events).toHaveLength(1);
    expect(client.getStatus().state).toBe('paused');
    client.disconnect();
  });

  it('coalesces concurrent session opens into one generation change', async () => {
    const fetch = jest.fn().mockResolvedValue(response(201, {
      ok: true,
      sessionId: '123e4567-e89b-42d3-a456-426614174000',
      generation: 'generation',
      deviceId: 'ios-test',
      expectedSequence: 1,
    }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });
    const internals = client as unknown as { _openSession(): Promise<void> };

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    const reopenFromEvents = internals._openSession();
    const reopenFromHeartbeat = internals._openSession();

    try {
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(1);
      await Promise.all([reopenFromEvents, reopenFromHeartbeat]);
    } finally {
      await flushPromises();
      client.disconnect();
    }
  });

  it('hashes the same normalized data that it sends over JSON', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
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
    const internals = client as unknown as {
      _enqueueEvent(event: { timestamp: number; type: string; severity: string; data: unknown }): void;
      _doFlush(): Promise<void>;
    };

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    await flushPromises();
    internals._enqueueEvent({
      timestamp: 1700000000000,
      type: 'network',
      severity: 'info',
      data: { response: { toJSON: () => ({ serialized: true }) } },
    });
    await internals._doFlush();

    const request = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(request.events[0].data).toEqual({
      response: { toJSON: { $type: 'function', name: 'toJSON' } },
    });
    client.disconnect();
  });

  it('retries the same in-flight batch after a transient events failure', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, {
        ok: true,
        sessionId: '123e4567-e89b-42d3-a456-426614174000',
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
    const internals = client as unknown as {
      _enqueueEvent(event: { timestamp: number; type: string; severity: string; data: unknown }): void;
      _doFlush(): Promise<void>;
    };

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3799' });
    client.connect();
    await flushPromises();
    internals._enqueueEvent({
      timestamp: 1700000000000,
      type: 'console',
      severity: 'info',
      data: { message: 'retry-me' },
    });
    await internals._doFlush();
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
