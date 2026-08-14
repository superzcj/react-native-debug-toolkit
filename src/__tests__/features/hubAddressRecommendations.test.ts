import {
  buildHubAddressRecommendations,
  extractIpv4SubnetPrefix,
  resolveHubAddressSubmission,
} from '../../features/devConnect/hubAddressRecommendations';

describe('Hub address recommendations', () => {
  it('derives exactly three valid IPv4 segments', () => {
    expect(extractIpv4SubnetPrefix('192.168.1.45')).toBe('192.168.1.');
    expect(extractIpv4SubnetPrefix('10.0.0.7')).toBe('10.0.0.');
    expect(extractIpv4SubnetPrefix('fe80::1')).toBeNull();
    expect(extractIpv4SubnetPrefix('192.168.1.999')).toBeNull();
  });

  it('orders the subnet before the configured endpoint and omits absent values', () => {
    expect(buildHubAddressRecommendations({
      subnetPrefix: '192.168.1.',
      configuredEndpoint: 'http://192.168.1.203:3800',
    })).toEqual([
      { kind: 'subnet', value: '192.168.1.' },
      { kind: 'configured', value: 'http://192.168.1.203:3800' },
    ]);

    expect(buildHubAddressRecommendations({
      subnetPrefix: null,
      configuredEndpoint: '',
    })).toEqual([]);

    expect(buildHubAddressRecommendations({
      subnetPrefix: null,
      configuredEndpoint: 'http://10.20.4.10:3800',
    })).toEqual([
      { kind: 'configured', value: 'http://10.20.4.10:3800' },
    ]);
  });

  it('distinguishes valid manual input from clear and invalid input', () => {
    expect(resolveHubAddressSubmission('', 'http://192.168.1.203:3800')).toEqual({
      kind: 'clear',
      fallbackEndpoint: 'http://192.168.1.203:3800',
    });
    expect(resolveHubAddressSubmission('192.168.1.123', 'http://192.168.1.203:3800')).toEqual({
      kind: 'save',
      endpoint: 'http://192.168.1.123:3800',
    });
    expect(resolveHubAddressSubmission(
      'http://192.168.1.203:3800',
      'http://192.168.1.203:3800',
    )).toEqual({
      kind: 'save',
      endpoint: 'http://192.168.1.203:3800',
    });
    expect(resolveHubAddressSubmission('https://192.168.1.123', '')).toEqual({
      kind: 'invalid',
    });
  });
});
