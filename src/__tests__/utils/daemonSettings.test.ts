import {
  buildDeviceDaemonEndpoint,
  normalizeDaemonSettings,
} from '../../utils/daemonSettings';

describe('daemonSettings', () => {
  it('uses default daemon endpoint for simulator mode', () => {
    expect(normalizeDaemonSettings({
      mode: 'simulator',
      deviceHost: '',
      token: '',
      endpoint: '',
    })).toEqual({});
  });

  it('builds a desktop daemon endpoint from a real device host', () => {
    expect(buildDeviceDaemonEndpoint('192.168.1.10')).toBe('http://192.168.1.10:3799');
    expect(buildDeviceDaemonEndpoint('http://192.168.1.10:3800')).toBe('http://192.168.1.10:3800');
  });

  it('keeps token when normalizing real device settings', () => {
    expect(normalizeDaemonSettings({
      mode: 'device',
      deviceHost: '192.168.1.10',
      token: ' dev-token ',
      endpoint: '',
    })).toEqual({
      endpoint: 'http://192.168.1.10:3799',
      token: 'dev-token',
    });
  });
});
