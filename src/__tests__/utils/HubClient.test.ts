// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { HubClient } from '../../utils/HubClient';
import type { FeatureDataProvider } from '../../types';
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

const openBody = {
  ok: true,
  sessionId: '123e4567-e89b-42d3-a456-426614174000',
  deviceId: 'ios-test',
  expectedSequence: 1,
  ackThrough: 0,
};

describe('HubClient transport', () => {
  afterEach(() => {
    // @ts-expect-error __DEV__ is a React Native global
    global.__DEV__ = true;
    jest.useRealTimers();
    jest.restoreAllMocks();
    _resetNetworkForTesting();
  });

  it('excludes the configured Hub origin from captured network logs', () => {
    const client = new HubClient({ fetch: jest.fn(), featureProvider: createFeatureProvider() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });

    expect(_isNetworkUrlBlacklistedForTesting('http://10.20.4.10:3800/api/v1/apps/com.example.audit/sessions'))
      .toBe(true);
  });

  it('uploads events without payloadHash or generation', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, openBody))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        ackThrough: 1,
        expectedSequence: 2,
        rejected: [],
      }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProviderWithConsoleEntry() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });
    client.connect();
    await flushPromises();
    await client.syncNow();

    const request = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(request.generation).toBeUndefined();
    expect(request.events[0].payloadHash).toBeUndefined();
    expect(request.events[0]).toMatchObject({
      sequence: 1,
      type: 'console',
      severity: 'info',
    });
    expect(fetch.mock.calls[1]![1].headers).toMatchObject({
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });
    client.disconnect();
  });

  it('normalizes fractional native log timestamps before uploading', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, openBody))
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

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });
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
      .mockResolvedValueOnce(response(201, openBody))
      .mockResolvedValueOnce(response(200, {
        ok: true,
        ackThrough: 1,
        expectedSequence: 2,
        rejected: [],
      }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProviderWithConsoleEntry() });

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });
    await client.syncNow();

    const eventRequest = fetch.mock.calls.find(([url, init]) =>
      String(url).includes('/events') && init?.method === 'POST',
    );
    expect(eventRequest).toBeDefined();
    expect(JSON.parse(eventRequest![1]!.body).events).toHaveLength(1);
    expect(client.getStatus().state).toBe('paused');
    client.disconnect();
  });

  it('coalesces concurrent session opens into one request', async () => {
    const fetch = jest.fn().mockResolvedValue(response(201, openBody));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });
    const internals = client as unknown as { _openSession(): Promise<void> };

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });
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

  it('normalizes host objects before sending JSON', async () => {
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(201, openBody))
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

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });
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
      .mockResolvedValueOnce(response(201, openBody))
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

    client.configure({ appId: 'com.example.audit', endpoint: 'http://10.20.4.10:3800' });
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
