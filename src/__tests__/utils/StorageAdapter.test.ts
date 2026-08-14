const mockCreateMMKV = jest.fn();

jest.mock('react-native-mmkv', () => ({
  createMMKV: (options: unknown) => mockCreateMMKV(options),
}));

import { createDefaultLogStorage, MemoryStorageAdapter } from '../../utils/StorageAdapter';

describe('StorageAdapter', () => {
  it('stores, reads, and removes values in memory', async () => {
    const storage = new MemoryStorageAdapter();

    await storage.setItem('key', 'value');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('value');

    await storage.removeItem('key');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBeNull();
  });

  it('owns one MMKV store for all Toolkit persistence', async () => {
    const set = jest.fn();
    const remove = jest.fn();
    const getString = jest.fn().mockReturnValue('from-mmkv');
    mockCreateMMKV.mockReturnValue({ getString, set, remove });

    const storage = createDefaultLogStorage();
    const sameStorage = createDefaultLogStorage();

    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('from-mmkv');
    await storage.setItem('key', 'value');
    await storage.removeItem('key');

    expect(sameStorage).toBe(storage);
    expect(mockCreateMMKV).toHaveBeenCalledWith({ id: 'react-native-debug-toolkit' });
    expect(set).toHaveBeenCalledWith('key', 'value');
    expect(remove).toHaveBeenCalledWith('key');
  });
});
