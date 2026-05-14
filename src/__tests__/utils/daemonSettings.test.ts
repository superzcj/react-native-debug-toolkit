import {
  _resetDaemonClientForTesting,
  buildDeviceDaemonEndpoint,
  loadDaemonStreamingEnabled,
  loadDaemonSettings,
  normalizeDaemonSettings,
  saveDaemonSettings,
  saveDaemonStreamingEnabled,
} from '../../utils/DaemonClient';

describe('daemonSettings', () => {
  beforeEach(() => {
    _resetDaemonClientForTesting();
  });

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

  it('persists live streaming enabled state', async () => {
    await expect(loadDaemonStreamingEnabled()).resolves.toBeNull();

    await saveDaemonStreamingEnabled(true);

    await saveDaemonStreamingEnabled(false);
  });

  it('keeps daemon settings in runtime memory', async () => {
    await saveDaemonSettings({
      mode: 'device',
      deviceHost: ' 192.168.1.10 ',
      token: ' dev-token ',
      endpoint: '',
    });

    await expect(loadDaemonSettings()).resolves.toEqual({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
      token: 'dev-token',
    });
  });
});
