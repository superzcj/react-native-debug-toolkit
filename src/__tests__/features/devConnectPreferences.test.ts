import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
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
    mockedIsSimulator.mockReturnValue(false);
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
});
