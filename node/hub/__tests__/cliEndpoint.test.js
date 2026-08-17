'use strict';

const {
  resolveCliHubEndpoint,
  resolveCliHubCandidates,
  probeHubReady,
} = require('../src/cli/resolveEndpoint');

describe('CLI Hub endpoint resolution', () => {
  it('uses an explicit endpoint without falling back', async () => {
    const probeReady = jest.fn(async () => ({
      ok: true,
      name: 'react-native-debug-toolkit-hub',
      protocolVersion: 1,
    }));

    await expect(resolveCliHubEndpoint({
      explicitEndpoint: 'http://10.20.4.10:3800',
      projectEndpoint: 'http://172.31.23.124:3800',
      probeReady,
    })).resolves.toEqual({
      endpoint: 'http://10.20.4.10:3800',
      attempted: ['http://10.20.4.10:3800'],
    });
    expect(probeReady).toHaveBeenCalledTimes(1);
  });

  it('probes loopback before the project endpoint', async () => {
    const probeReady = jest.fn(async (endpoint) => {
      if (endpoint === 'http://127.0.0.1:3800') {
        return { ok: true, name: 'react-native-debug-toolkit-hub', protocolVersion: 1 };
      }
      return null;
    });

    await expect(resolveCliHubEndpoint({
      explicitEndpoint: undefined,
      projectEndpoint: 'http://172.31.23.124:3800',
      probeReady,
    })).resolves.toEqual({
      endpoint: 'http://127.0.0.1:3800',
      attempted: ['http://127.0.0.1:3800'],
    });
  });

  it('falls back to the project endpoint and reports every attempt on failure', async () => {
    const probeReady = jest.fn(async (endpoint) => {
      if (endpoint === 'http://172.31.23.124:3800') {
        return { ok: true, name: 'react-native-debug-toolkit-hub', protocolVersion: 1 };
      }
      return null;
    });

    await expect(resolveCliHubEndpoint({
      explicitEndpoint: undefined,
      projectEndpoint: 'http://172.31.23.124:3800',
      probeReady,
    })).resolves.toEqual({
      endpoint: 'http://172.31.23.124:3800',
      attempted: [
        'http://127.0.0.1:3800',
        'http://172.31.23.124:3800',
      ],
    });

    await expect(resolveCliHubEndpoint({
      explicitEndpoint: undefined,
      projectEndpoint: 'http://172.31.23.124:3800',
      probeReady: async () => null,
    })).resolves.toEqual({
      endpoint: null,
      attempted: [
        'http://127.0.0.1:3800',
        'http://172.31.23.124:3800',
      ],
    });
  });
});

describe('detailed Hub probing', () => {
  it('classifies compatible, incompatible, not-ready, non-JSON, and unreachable probes', async () => {
    const compatible = await probeHubReady('http://127.0.0.1:3800', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        name: 'react-native-debug-toolkit-hub',
        protocolVersion: 1,
      }),
    }));
    expect(compatible).toMatchObject({ kind: 'compatible', httpStatus: 200 });

    const incompatible = await probeHubReady('http://127.0.0.1:3800', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, name: 'other', protocolVersion: 2 }),
    }));
    expect(incompatible.kind).toBe('incompatible');

    const notReady = await probeHubReady('http://127.0.0.1:3800', async () => ({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: { code: 'HUB_NOT_READY' } }),
    }));
    expect(notReady).toMatchObject({ kind: 'not_ready', httpStatus: 503 });

    const nonJson = await probeHubReady('http://127.0.0.1:3800', async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json'); },
    }));
    expect(nonJson.kind).toBe('not_ready');

    const unreachable = await probeHubReady('http://127.0.0.1:3800', async () => {
      throw new Error('timeout');
    });
    expect(unreachable).toMatchObject({ kind: 'unreachable', httpStatus: null, error: 'timeout' });
  });

  it('probes every implicit candidate even when loopback is compatible', async () => {
    const seen = [];
    const result = await resolveCliHubCandidates({
      projectEndpoint: 'http://172.31.23.124:3800',
      probeHubReady: async (endpoint) => {
        seen.push(endpoint);
        return {
          endpoint,
          kind: endpoint.includes('127.0.0.1') ? 'compatible' : 'unreachable',
          httpStatus: endpoint.includes('127.0.0.1') ? 200 : null,
          payload: null,
          error: null,
        };
      },
    });
    expect(seen).toEqual(['http://127.0.0.1:3800', 'http://172.31.23.124:3800']);
    expect(result.explicit).toBe(false);
    expect(result.results).toHaveLength(2);
  });

  it('probes exactly one explicit Hub and honors a validated localEndpoint override', async () => {
    const explicit = await resolveCliHubCandidates({
      explicitEndpoint: 'http://10.20.4.10:3800',
      projectEndpoint: 'http://172.31.23.124:3800',
      probeHubReady: async (endpoint) => ({
        endpoint, kind: 'compatible', httpStatus: 200, payload: {}, error: null,
      }),
    });
    expect(explicit.attempted).toEqual(['http://10.20.4.10:3800']);
    expect(explicit.explicit).toBe(true);

    const override = await resolveCliHubCandidates({
      localEndpoint: 'http://127.0.0.1:3999',
      projectEndpoint: 'http://127.0.0.1:3999',
      probeHubReady: async (endpoint) => ({
        endpoint, kind: 'compatible', httpStatus: 200, payload: {}, error: null,
      }),
    });
    expect(override.attempted).toEqual(['http://127.0.0.1:3999']);
  });
});
