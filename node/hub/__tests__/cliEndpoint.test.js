'use strict';

const { resolveCliHubEndpoint } = require('../src/cli/resolveEndpoint');

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
