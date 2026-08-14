const mockCreateMMKV = jest.fn();

jest.mock('react-native-mmkv', () => ({
  createMMKV: (options: unknown) => mockCreateMMKV(options),
}));

import {
  setPreference,
  getPreference,
  removePreference,
  KEYS,
} from '../../utils/debugPreferences';

describe('debugPreferences', () => {
  it('persists preferences in the Toolkit MMKV store', async () => {
    const values = new Map<string, string>();
    const getString = jest.fn((key: string) => values.get(key));
    const set = jest.fn((key: string, value: string) => values.set(key, value));
    const remove = jest.fn((key: string) => values.delete(key));
    mockCreateMMKV.mockReturnValue({ getString, set, remove });

    await setPreference(KEYS.fabPosition, '{"x":10,"y":20}');

    await expect(getPreference(KEYS.fabPosition)).resolves.toBe('{"x":10,"y":20}');
    await removePreference(KEYS.fabPosition);
    await expect(getPreference(KEYS.fabPosition)).resolves.toBeNull();
    expect(mockCreateMMKV).toHaveBeenCalledWith({ id: 'react-native-debug-toolkit' });
    expect(set).toHaveBeenCalledWith(KEYS.fabPosition, '{"x":10,"y":20}');
    expect(remove).toHaveBeenCalledWith(KEYS.fabPosition);
  });

  it('exposes expected key constants', () => {
    expect(KEYS.fabPosition).toContain('fab_position');
    expect(KEYS.lastTab).toContain('last_tab');
    expect('consoleLogs' in KEYS).toBe(false);
    expect('networkLogs' in KEYS).toBe(false);
    expect('trackLogs' in KEYS).toBe(false);
  });
});
