import {
  setPreference,
  getPreference,
  removePreference,
  KEYS,
  setPreferenceStorage,
} from '../../utils/debugPreferences';
import { NativeModules } from 'react-native';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';

describe('debugPreferences', () => {
  afterEach(() => {
    setPreferenceStorage();
    delete NativeModules.DebugToolkitDevConnect;
  });

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

  });

  it('treats host preference storage as the authoritative source', async () => {
    const storage = new MemoryStorageAdapter();
    NativeModules.DebugToolkitDevConnect = {
      getPreference: jest.fn(async () => 'stale-native-value'),
      setPreference: jest.fn(async () => undefined),
    };
    setPreferenceStorage(storage);

    await setPreference('@react_native_debug_toolkit/host_test', 'host-value');

    await expect(getPreference('@react_native_debug_toolkit/host_test')).resolves.toBe('host-value');
    await expect(getPreference('@react_native_debug_toolkit/host_missing')).resolves.toBeNull();
    expect(NativeModules.DebugToolkitDevConnect.setPreference).not.toHaveBeenCalled();
    expect(NativeModules.DebugToolkitDevConnect.getPreference).not.toHaveBeenCalled();
  });

  it('removes values from preference storage', async () => {
    await setPreference('@react_native_debug_toolkit/remove_test', 'saved-value');

    await removePreference('@react_native_debug_toolkit/remove_test');

    await expect(getPreference('@react_native_debug_toolkit/remove_test')).resolves.toBeNull();
  });

  it('exposes expected key constants', () => {
    expect(KEYS.fabPosition).toContain('fab_position');
    expect(KEYS.lastTab).toContain('last_tab');
    expect('consoleLogs' in KEYS).toBe(false);
    expect('networkLogs' in KEYS).toBe(false);
    expect('trackLogs' in KEYS).toBe(false);
  });
});
