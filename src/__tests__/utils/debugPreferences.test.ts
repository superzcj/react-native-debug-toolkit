const mockCreateMMKV = jest.fn();

jest.mock('react-native-mmkv', () => ({
  createMMKV: (options: unknown) => mockCreateMMKV(options),
}));

import {
  setPreference,
  getPreference,
  removePreference,
  persistPreference,
  KEYS,
  bindPreferenceStorage,
} from '../../utils/debugPreferences';
import { createDefaultLogStorage } from '../../utils/StorageAdapter';

describe('debugPreferences', () => {
  it('persists preferences in the Toolkit MMKV store', async () => {
    const values = new Map<string, string>();
    const getString = jest.fn((key: string) => values.get(key));
    const set = jest.fn((key: string, value: string) => values.set(key, value));
    const remove = jest.fn((key: string) => values.delete(key));
    mockCreateMMKV.mockReturnValue({ getString, set, remove });
    const release = bindPreferenceStorage(createDefaultLogStorage());

    await setPreference(KEYS.fabPosition, '{"x":10,"y":20}');

    await expect(getPreference(KEYS.fabPosition)).resolves.toBe('{"x":10,"y":20}');
    await removePreference(KEYS.fabPosition);
    await expect(getPreference(KEYS.fabPosition)).resolves.toBeNull();
    expect(mockCreateMMKV).toHaveBeenCalledWith({ id: 'react-native-debug-toolkit' });
    expect(set).toHaveBeenCalledWith(KEYS.fabPosition, '{"x":10,"y":20}');
    expect(remove).toHaveBeenCalledWith(KEYS.fabPosition);
    release();
  });

  it('exposes expected key constants', () => {
    expect(KEYS.fabPosition).toContain('fab_position');
    expect(KEYS.lastTab).toContain('last_tab');
    expect(KEYS.hubEndpoint).toBe('@react_native_debug_toolkit/hub_endpoint');
    expect('consoleLogs' in KEYS).toBe(false);
    expect('networkLogs' in KEYS).toBe(false);
    expect('trackLogs' in KEYS).toBe(false);
  });

  it('reports rejected writes without rejecting best-effort UI persistence', async () => {
    const error = new Error('disk full');
    const storage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(() => { throw error; }),
      removeItem: jest.fn(),
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const release = bindPreferenceStorage(storage);

    await expect(persistPreference(KEYS.lastTab, 'network')).resolves.toBe(error);
    expect(warn).toHaveBeenCalledWith(
      `[DebugToolkit] Failed to persist preference "${KEYS.lastTab}":`,
      error,
    );

    warn.mockRestore();
    release();
  });
});
