import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
  saveConnectionMode,
} from '../../features/devConnect/devConnectPreferences';

describe('devConnectPreferences', () => {
  beforeEach(async () => {
    _resetDaemonClientForTesting();
    await setPreference(KEYS.computerHost, '');
    await setPreference(KEYS.connectionMode, '');
  });

  it('saves normalized computer host only', async () => {
    const host = await saveComputerHost('exp://192.168.1.10:8081');

    expect(host).toBe('192.168.1.10');
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
  });

  it('does not overwrite stored host when input is invalid', async () => {
    await saveComputerHost('192.168.1.10');
    const host = await saveComputerHost('999.1.1.1');

    expect(host).toBeNull();
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
  });

  it('persists valid connection mode', async () => {
    await saveConnectionMode('device');

    expect(await getPreference(KEYS.connectionMode)).toBe('device');
    await expect(loadDevConnectPreferences()).resolves.toEqual({
      computerHost: '',
      mode: 'device',
    });
  });

  it('configures daemon from persisted DevConnect settings using daemon port 3799', async () => {
    await setPreference(KEYS.computerHost, 'exp://192.168.1.10:8081');
    await setPreference(KEYS.connectionMode, 'device');

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toEqual({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
      token: '',
    });
  });
});
