import {
  buildHubEndpointCandidates,
  isCompatibleHubReadyPayload,
  resolveHubEndpoint,
  selectEndpoint,
  probeHubReady,
} from '../../utils/HubEndpointResolver';

describe('HubEndpointResolver', () => {
  it('builds Debug candidates in design order and dedupes', () => {
    expect(buildHubEndpointCandidates({
      isDev: true,
      platform: 'android',
      runtimeOverride: null,
      configuredEndpoint: 'http://10.20.4.10:3800',
      metroHost: '172.31.23.67',
    })).toEqual([
      'http://10.20.4.10:3800',
    ]);

    expect(buildHubEndpointCandidates({
      isDev: true,
      platform: 'ios',
      runtimeOverride: null,
      configuredEndpoint: 'http://127.0.0.1:3800',
      metroHost: '127.0.0.1',
    })).toEqual([
      'http://127.0.0.1:3800',
    ]);
  });

  it('uses only the runtime override when set', () => {
    expect(buildHubEndpointCandidates({
      isDev: true,
      platform: 'ios',
      runtimeOverride: 'http://192.168.1.8:3800',
      configuredEndpoint: 'http://10.20.4.10:3800',
      metroHost: '172.31.23.67',
    })).toEqual(['http://192.168.1.8:3800']);
  });

  it('skips discovery candidates outside Debug builds', () => {
    expect(buildHubEndpointCandidates({
      isDev: false,
      platform: 'ios',
      runtimeOverride: null,
      configuredEndpoint: 'http://10.20.4.10:3800',
      metroHost: '172.31.23.67',
    })).toEqual(['http://10.20.4.10:3800']);
  });

  it('accepts only compatible Hub /ready payloads', () => {
    expect(isCompatibleHubReadyPayload({
      ok: true,
      name: 'react-native-debug-toolkit-hub',
      protocolVersion: 1,
    })).toBe(true);

    expect(isCompatibleHubReadyPayload({ ok: true, name: 'something-else' })).toBe(false);
    expect(isCompatibleHubReadyPayload({ ok: true })).toBe(false);
    expect(isCompatibleHubReadyPayload(null)).toBe(false);
  });

  it('probes candidates until a compatible Hub answers', async () => {
    const probeReady = jest.fn(async (endpoint: string) => {
      if (endpoint === 'http://10.0.2.2:3800') {
        return { ok: true, name: 'react-native-debug-toolkit-hub', protocolVersion: 1 };
      }
      return null;
    });

    const result = await resolveHubEndpoint({
      isDev: true,
      platform: 'android',
      runtimeOverride: null,
      configuredEndpoint: null,
      getMetroHost: () => '172.31.23.67',
      probeReady,
    });

    expect(result).toEqual({
      endpoint: 'http://10.0.2.2:3800',
      attempted: [
        'http://172.31.23.67:3800',
        'http://10.0.2.2:3800',
      ],
    });
    expect(probeReady).toHaveBeenCalledTimes(2);
  });

  it('returns null and lists every attempted address when none are compatible', async () => {
    const result = await resolveHubEndpoint({
      isDev: true,
      platform: 'ios',
      runtimeOverride: null,
      configuredEndpoint: 'http://10.20.4.10:3800',
      getMetroHost: () => null,
      probeReady: async () => ({ ok: true, name: 'not-a-hub' }),
    });

    expect(result).toEqual({
      endpoint: null,
      attempted: [
        'http://10.20.4.10:3800',
      ],
    });
  });

  it.each([
    [{ manual: 'manual', configured: 'configured', automatic: 'auto' }, 'manual', 'manual'],
    [{ configured: 'configured', automatic: 'auto' }, 'configured', 'configured'],
    [{ automatic: 'auto' }, 'auto', 'automatic'],
  ])('selects exactly one address source: %j', (input, endpoint, origin) => {
    expect(selectEndpoint(input)).toEqual({ endpoint, origin });
  });

  it('does not fallback when an explicit address is invalid or unreachable', async () => {
    const probeReady = jest.fn(async () => null);
    expect(buildHubEndpointCandidates({ isDev: true, platform: 'ios', configuredEndpoint: 'https://invalid/path' })).toEqual([]);
    const result = await resolveHubEndpoint({ isDev: true, configuredEndpoint: 'http://bad:3800', probeReady });
    expect(result.attempted).toEqual(['http://bad:3800']);
    expect(selectEndpoint({})).toBeNull();
  });

  it('aborts a pending ready probe and clears its deadline', async () => {
    jest.useFakeTimers();
    const owner = new AbortController();
    let signal: AbortSignal | undefined;
    const pending = probeHubReady('http://host:3800', {
      signal: owner.signal,
      fetch: async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise(() => {}); },
    });
    owner.abort();
    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
