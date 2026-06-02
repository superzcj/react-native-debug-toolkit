import { setPreference, getPreference, removePreference, KEYS } from '../../utils/debugPreferences';
import { NativeModules } from 'react-native';

describe('debugPreferences', () => {
  it('stores and retrieves values (memory fallback)', async () => {
    await setPreference(KEYS.fabPosition, '{"x":10,"y":20}');
    const val = await getPreference(KEYS.fabPosition);
    expect(val).toBe('{"x":10,"y":20}');
  });

  it('returns null for missing keys', async () => {
    const val = await getPreference('nonexistent');
    expect(val).toBeNull();
  });

  it('uses native preference storage when native module is installed', async () => {
    NativeModules.DebugToolkitDevConnect = {
      getPreference: jest.fn(async () => 'native-value'),
      setPreference: jest.fn(async () => undefined),
    };

    await setPreference('@react_native_debug_toolkit/native_test', 'saved-value');
    await expect(getPreference('@react_native_debug_toolkit/native_test_read')).resolves.toBe('native-value');

    expect(NativeModules.DebugToolkitDevConnect.setPreference).toHaveBeenCalledWith(
      '@react_native_debug_toolkit/native_test',
      'saved-value',
    );

    delete NativeModules.DebugToolkitDevConnect;
  });

  it('removes values from preference storage', async () => {
    await setPreference('@react_native_debug_toolkit/remove_test', 'saved-value');

    await removePreference('@react_native_debug_toolkit/remove_test');

    await expect(getPreference('@react_native_debug_toolkit/remove_test')).resolves.toBeNull();
  });

  it('exposes expected key constants', () => {
    expect(KEYS.fabPosition).toContain('fab_position');
    expect(KEYS.lastTab).toContain('last_tab');
    expect(KEYS.computerHost).toContain('computer_host');
    expect(KEYS.daemonPort).toContain('daemon_port');
    expect('consoleLogs' in KEYS).toBe(false);
    expect('networkLogs' in KEYS).toBe(false);
    expect('trackLogs' in KEYS).toBe(false);
  });
});
