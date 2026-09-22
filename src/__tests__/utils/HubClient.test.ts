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
  it('keeps a failed Release Upload Once paused when the session retry succeeds', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn()
      .mockResolvedValueOnce(response(503, { ok: false }))
      .mockResolvedValue(response(201, openBody));
    const provider = createFeatureProviderWithConsoleEntry();
    let changed!: () => void;
    provider.features[0]!.subscribe = listener => { changed = listener; return () => {}; };
    const client = new HubClient({ fetch, featureProvider: provider });
    client.setDebugBuild(false);
    client.configure({ appId: 'app', endpoint: 'http://hub:3800' });
    await client.syncNow();
    expect(client.isSyncPaused()).toBe(true);
    await jest.advanceTimersByTimeAsync(1300);
    expect(client.getStatus().state).toBe('paused');
    changed();
    await jest.advanceTimersByTimeAsync(2000);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/events'))).toHaveLength(0);
    client.disconnect();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('opens a discovered session after clearing the only manual address', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn().mockResolvedValue(response(201, openBody));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });
    client.configure({ appId: 'app' });
    client.setRuntimeEndpoint('http://manual:3800');
    client.connect({ live: true });
    await flushPromises();
    client.clearRuntimeEndpoint();
    await flushPromises();
    expect(client.isActive()).toBe(true);
    expect(client.getStatus().session).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    client.setDiscoveredEndpoint('http://automatic:3800');
    await flushPromises();
    expect(client.getStatus().session).not.toBeNull();
    expect(fetch.mock.calls.at(-1)[0]).toContain('http://automatic:3800/');
    client.disconnect();
  });

  it.each(['discovery', 'manual', 'session'] as const)('clears old discovery errors after %s succeeds', async recovery => {
    jest.useFakeTimers();
    const client = new HubClient({ fetch: jest.fn().mockResolvedValue(response(201, openBody)), featureProvider: createFeatureProvider() });
    const observed = jest.fn();
    client.subscribeStatus(observed);
    client.configure({ appId: 'app', endpoint: recovery === 'session' ? 'http://hub:3800' : undefined });
    client.markDiscoveryFailed(['http://failed:3800']);
    expect(client.getStatus().error).toContain('No compatible Hub');
    if (recovery === 'discovery') { client.setDiscoveredEndpoint('http://automatic:3800'); }
    if (recovery === 'manual') { client.setRuntimeEndpoint('http://manual:3800'); }
    if (recovery === 'session') { client.connect(); await flushPromises(); }
    expect(client.getStatus().error).toBeUndefined();
    expect(observed).toHaveBeenLastCalledWith(expect.objectContaining({ error: undefined }));
    client.disconnect();
  });
  it('does not install a heartbeat after a connected observer disconnects the client', async () => {
    jest.useFakeTimers();
    const client = new HubClient({ fetch: jest.fn().mockResolvedValue(response(201, openBody)), featureProvider: createFeatureProvider() });
    client.configure({ appId: 'app', endpoint: 'http://hub:3800' });
    client.setOnStatusChange(status => { if (status.state === 'connected') { client.disconnect(); } });
    client.connect();
    await flushPromises();
    expect(client.isActive()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('uses the resolved native Release mode for one-shot uploads', async () => {
    const fetch = jest.fn().mockResolvedValue(response(201, openBody));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });
    client.setDebugBuild(false);
    client.configure({ appId: 'app', endpoint: 'http://hub:3800' });
    await client.syncNow();
    expect(client.isSyncPaused()).toBe(true);
    client.disconnect();
  });

  it('aborts an old endpoint request and keeps its late result out of the replacement session', async () => {
    jest.useFakeTimers();
    let finish!: (value: ReturnType<typeof response>) => void;
    const fetch = jest.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(response(201, { ...openBody, sessionId: 'new-session' }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });
    client.configure({ appId: 'app', endpoint: 'http://original:3800' });
    client.connect();
    await flushPromises();
    const oldSignal = fetch.mock.calls[0][1].signal;
    client.setRuntimeEndpoint('http://replacement:3800');
    await flushPromises();
    finish(response(201, { ...openBody, sessionId: 'stale-session' }));
    await flushPromises();
    expect(oldSignal.aborted).toBe(true);
    expect(client.getStatus().session?.sessionId).toBe('new-session');
    expect(fetch.mock.calls[1][0]).toContain('http://replacement:3800/');
    client.disconnect();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('keeps configured endpoints above discovered endpoints', () => {
    const client = new HubClient({ featureProvider: createFeatureProvider() });
    client.configure({ appId: 'app', endpoint: 'http://configured:3800' });
    client.setDiscoveredEndpoint('http://automatic:3800');
    expect(client.getEffectiveEndpoint()).toBe('http://configured:3800');
    client.setRuntimeEndpoint('http://manual:3800');
    expect(client.getEffectiveEndpoint()).toBe('http://manual:3800');
    client.clearRuntimeEndpoint();
    expect(client.getEffectiveEndpoint()).toBe('http://configured:3800');
  });

  it('ignores and aborts a session response completed after disconnect', async () => {
    jest.useFakeTimers();
    let finish!: (value: ReturnType<typeof response>) => void;
    const fetch = jest.fn(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
    const client = new HubClient({ fetch, featureProvider: createFeatureProvider() });
    client.configure({ appId: 'app', endpoint: 'http://hub:3800' });
    client.connect();
    await flushPromises();
    const signal = (fetch.mock.calls[0] as unknown as [string, { signal: AbortSignal }])[1].signal;
    client.disconnect();
    expect(signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    finish(response(201, openBody));
    await flushPromises();
    expect(client.getStatus().session).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
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
