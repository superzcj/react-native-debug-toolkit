import { setPreference, getPreference, KEYS } from '../../utils/debugPreferences';

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

  it('exposes expected key constants', () => {
    expect(KEYS.fabPosition).toContain('fab_position');
    expect(KEYS.lastTab).toContain('last_tab');
  });
});
