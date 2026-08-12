import { createDefaultLogStorage, MemoryStorageAdapter } from '../../utils/StorageAdapter';

describe('StorageAdapter', () => {
  it('stores, reads, and removes values in memory', async () => {
    const storage = new MemoryStorageAdapter();

    await storage.setItem('key', 'value');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('value');

    await storage.removeItem('key');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBeNull();
  });

  it('prefers MMKV when available', async () => {
    const set = jest.fn();
    const remove = jest.fn();
    const getString = jest.fn().mockReturnValue('from-mmkv');
    const MMKV = jest.fn(() => ({ getString, set, delete: remove }));

    const storage = createDefaultLogStorage((name) => {
      if (name === 'react-native-mmkv') return { MMKV };
      if (name === '@react-native-async-storage/async-storage') return {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      };
      throw new Error(`Unexpected module: ${name}`);
    });

    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('from-mmkv');
    await storage.setItem('key', 'value');
    await storage.removeItem('key');

    expect(MMKV).toHaveBeenCalledWith({ id: 'debug-toolkit-logs' });
    expect(set).toHaveBeenCalledWith('key', 'value');
    expect(remove).toHaveBeenCalledWith('key');
  });

  it('falls back to AsyncStorage default export before memory', async () => {
    const asyncStorage = {
      getItem: jest.fn().mockResolvedValue('from-async-storage'),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };

    const storage = createDefaultLogStorage((name) => {
      if (name === 'react-native-mmkv') throw new Error('missing mmkv');
      if (name === '@react-native-async-storage/async-storage') return { default: asyncStorage };
      throw new Error(`Unexpected module: ${name}`);
    });

    await expect(storage.getItem('key')).resolves.toBe('from-async-storage');
    await storage.setItem('key', 'value');
    await storage.removeItem('key');

    expect(asyncStorage.setItem).toHaveBeenCalledWith('key', 'value');
    expect(asyncStorage.removeItem).toHaveBeenCalledWith('key');
  });

  it('falls back to memory when optional native stores are unavailable', async () => {
    const storage = createDefaultLogStorage((name) => {
      if (name === 'react-native-mmkv') throw new Error('missing mmkv');
      if (name === '@react-native-async-storage/async-storage') throw new Error('missing async storage');
      throw new Error(`Unexpected module: ${name}`);
    });

    await storage.setItem('key', 'value');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('value');
  });
});
