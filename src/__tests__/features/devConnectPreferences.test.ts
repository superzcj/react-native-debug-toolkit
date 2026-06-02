import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
  saveComputerTarget,
  saveDaemonPort,
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
    await setPreference(KEYS.daemonPort, '');
    mockedIsSimulator.mockReturnValue(false);
  });

  it('loads saved host and falls back to default port', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');

    await expect(loadDevConnectPreferences()).resolves.toEqual({
      computerHost: '192.168.1.10',
      daemonPort: '3799',
    });
  });

  it('saves normalized computer host from URL input', async () => {
    const target = await saveComputerTarget('exp://192.168.1.10:8082');

    expect(target).toEqual({
      computerHost: '192.168.1.10',
    });
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
  });

  it('saves daemon port', async () => {
    await expect(saveDaemonPort('3800')).resolves.toBe('3800');
    expect(await getPreference(KEYS.daemonPort)).toBe('3800');
  });

  it('saves computer host without changing the stored daemon port', async () => {
    await setPreference(KEYS.daemonPort, '3800');

    await expect(saveComputerHost('192.168.1.11')).resolves.toBe('192.168.1.11');

    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.11');
    expect(await getPreference(KEYS.daemonPort)).toBe('3800');
  });

  it('does not overwrite stored host when input is invalid', async () => {
    await saveComputerTarget('192.168.1.10:8082');
    const target = await saveComputerTarget('999.1.1.1');

    expect(target).toBeNull();
    expect(await getPreference(KEYS.computerHost)).toBe('192.168.1.10');
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
