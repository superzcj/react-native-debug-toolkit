import { MemoryStorageAdapter } from '../../utils/StorageAdapter';

describe('StorageAdapter', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('stores, reads, and removes values in memory', async () => {
    const storage = new MemoryStorageAdapter();

    await storage.setItem('key', 'value');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('value');

    await storage.removeItem('key');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBeNull();
  });

  it('prefers MMKV when available', async () => {
    jest.resetModules();
    const set = jest.fn();
    const remove = jest.fn();
    const getString = jest.fn().mockReturnValue('from-mmkv');
    const MMKV = jest.fn(() => ({ getString, set, delete: remove }));

    jest.doMock('react-native-mmkv', () => ({ MMKV }), { virtual: true });
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    }), { virtual: true });

    const module = await import('../../utils/StorageAdapter');
    const storage = module.createDefaultLogStorage();

    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('from-mmkv');
    await storage.setItem('key', 'value');
    await storage.removeItem('key');

    expect(MMKV).toHaveBeenCalledWith({ id: 'debug-toolkit-logs' });
    expect(set).toHaveBeenCalledWith('key', 'value');
    expect(remove).toHaveBeenCalledWith('key');
  });

  it('falls back to AsyncStorage default export before memory', async () => {
    jest.resetModules();
    const asyncStorage = {
      getItem: jest.fn().mockResolvedValue('from-async-storage'),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
    };

    jest.doMock('react-native-mmkv', () => {
      throw new Error('missing mmkv');
    }, { virtual: true });
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      default: asyncStorage,
    }), { virtual: true });

    const module = await import('../../utils/StorageAdapter');
    const storage = module.createDefaultLogStorage();

    await expect(storage.getItem('key')).resolves.toBe('from-async-storage');
    await storage.setItem('key', 'value');
    await storage.removeItem('key');

    expect(asyncStorage.setItem).toHaveBeenCalledWith('key', 'value');
    expect(asyncStorage.removeItem).toHaveBeenCalledWith('key');
  });

  it('falls back to memory when optional native stores are unavailable', async () => {
    jest.resetModules();
    jest.doMock('react-native-mmkv', () => {
      throw new Error('missing mmkv');
    }, { virtual: true });
    jest.doMock('@react-native-async-storage/async-storage', () => {
      throw new Error('missing async storage');
    }, { virtual: true });

    const module = await import('../../utils/StorageAdapter');
    const storage = module.createDefaultLogStorage();

    await storage.setItem('key', 'value');
    await expect(Promise.resolve(storage.getItem('key'))).resolves.toBe('value');
  });
});
