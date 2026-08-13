import {
  buildHubEndpointCandidates,
  isCompatibleHubReadyPayload,
  resolveHubEndpoint,
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
      'http://172.31.23.67:3800',
      'http://10.0.2.2:3800',
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
      configuredEndpoint: 'http://10.20.4.10:3800',
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
        'http://127.0.0.1:3800',
        'http://10.20.4.10:3800',
      ],
    });
  });
});
