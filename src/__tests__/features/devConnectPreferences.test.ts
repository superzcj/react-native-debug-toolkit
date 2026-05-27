import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerTarget,
  saveDaemonPort,
  saveMetroPort,
} from '../../features/devConnect/devConnectPreferences';

jest.mock('../../features/devConnect/platformDetect', () => ({
  isSimulator: jest.fn().mockReturnValue(false),
}));

import { isSimulator } from '../../features/devConnect/platformDetect';
const mockedIsSimulator = isSimulator as jest.MockedFunction<typeof isSimulator>;

describe('devConnectPreferences', () => {
  beforeEach(async () => {
    _resetDaemonClientForTesting();
    await setPreference(KEYS.computerHost, '');
    await setPreference(KEYS.metroPort, '');
    await setPreference(KEYS.daemonPort, '');
    mockedIsSimulator.mockReturnValue(false);
  });

  it('loads saved host and falls back to default ports', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');

    await expect(loadDevConnectPreferences()).resolves.toEqual({
      computerHost: '192.168.1.10',
      metroPort: '8081',
      daemonPort: '3799',
    });
  });

  it('saves normalized computer target and Metro port from URL input', async () => {
    const target = await saveComputerTarget('exp://192.168.1.10:8082');

    expect(target).toEqual({
      computerHost: '192.168.1.10',
      metroPort: '8082',
    });
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
    expect(await getPreference(KEYS.metroPort)).toBe('8082');
  });

  it('saves Metro port and daemon port separately', async () => {
    await expect(saveMetroPort('8088')).resolves.toBe('8088');
    await expect(saveDaemonPort('3800')).resolves.toBe('3800');

    expect(await getPreference(KEYS.metroPort)).toBe('8088');
    expect(await getPreference(KEYS.daemonPort)).toBe('3800');
  });

  it('does not overwrite stored host when input is invalid', async () => {
    await saveComputerTarget('192.168.1.10:8082');
    const target = await saveComputerTarget('999.1.1.1');

    expect(target).toBeNull();
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
    expect(await getPreference(KEYS.metroPort)).toBe('8082');
  });

  it('configures daemon as simulator when platform is simulator', async () => {
    mockedIsSimulator.mockReturnValue(true);

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'simulator',
      endpoint: '',
    });
  });

  it('configures daemon as device with stored host', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');
    mockedIsSimulator.mockReturnValue(false);

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
    });
  });

  it('configures daemon with stored desktop logs port', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');
    await setPreference(KEYS.daemonPort, '3800');
    mockedIsSimulator.mockReturnValue(false);

    await restoreDevConnectSettingsToDaemon();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'device',
      deviceHost: '192.168.1.10:3800',
      endpoint: 'http://192.168.1.10:3800',
    });
  });
});
