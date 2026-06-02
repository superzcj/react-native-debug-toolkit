import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';

describe('createPersistedObservableStore', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('restores entries from storage on creation', async () => {
    const entries = [{ id: '1', value: 'a' }, { id: '2', value: 'b' }];
    await storage.setItem('test_key', JSON.stringify(entries));

    const store = createPersistedObservableStore<{ id: string; value: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 0,
    });

    await store.ready;

    expect(store.getData()).toHaveLength(2);
    expect(store.getData()[0]!.value).toBe('a');
  });

  it('nextId skips past restored entry IDs', async () => {
    const entries = [{ id: '5', value: 'x' }, { id: '8', value: 'y' }];
    await storage.setItem('test_key', JSON.stringify(entries));

    const store = createPersistedObservableStore<{ id: string; value: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 0,
    });

    await store.ready;

    expect(store.nextId()).toBe('9');
    expect(store.nextId()).toBe('10');
  });

  it('persists pushed entries through the provided storage adapter', async () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(storage, 'setItem');

    const store = createPersistedObservableStore<{ id: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 1000,
    });

    store.push({ id: '1' });
    store.push({ id: '2' });
    expect(setItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(setItem).toHaveBeenCalledWith('test_key', JSON.stringify([{ id: '1' }, { id: '2' }]));
  });

  it('respects maxPersist limit', async () => {
    jest.useFakeTimers();

    const store = createPersistedObservableStore<{ id: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 2,
      debounceMs: 100,
    });

    store.push({ id: '1' });
    store.push({ id: '2' });
    store.push({ id: '3' });

    jest.advanceTimersByTime(100);

    const written = JSON.parse((await storage.getItem('test_key'))!);
    expect(written).toHaveLength(2);
    expect(written[0].id).toBe('2');
    expect(written[1].id).toBe('3');
  });

  it('applies serialize function before writing', async () => {
    jest.useFakeTimers();

    const store = createPersistedObservableStore<{ id: string; secret: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 100,
      serialize: (entry) => ({ id: entry.id }),
    });

    store.push({ id: '1', secret: 'hidden' });

    jest.advanceTimersByTime(100);

    const written = JSON.parse((await storage.getItem('test_key'))!);
    expect(written).toEqual([{ id: '1' }]);
  });

  it('clearPersisted immediately writes an empty array', async () => {
    jest.useFakeTimers();

    const store = createPersistedObservableStore<{ id: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 100,
    });

    store.push({ id: '1' });
    store.clearPersisted();

    expect(await storage.getItem('test_key')).toBe('[]');
    expect(store.getData()).toHaveLength(0);
  });

  it('dispose cancels pending writes without clearing persisted data', async () => {
    jest.useFakeTimers();
    await storage.setItem('test_key', JSON.stringify([{ id: 'old' }]));

    const store = createPersistedObservableStore<{ id: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 100,
    });

    await store.ready;
    store.push({ id: 'new' });
    store.dispose();
    jest.advanceTimersByTime(100);

    expect(store.getData()).toEqual([]);
    expect(await storage.getItem('test_key')).toBe(JSON.stringify([{ id: 'old' }]));
  });

  it('notifies subscribers on restore', async () => {
    const listener = jest.fn();
    await storage.setItem('test_key', JSON.stringify([{ id: '1' }]));

    const store = createPersistedObservableStore<{ id: string }>({
      storage,
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 0,
    });
    store.subscribe(listener);

    await store.ready;

    expect(listener).toHaveBeenCalled();
  });
});
