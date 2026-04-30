import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { getPreference, setPreference } from '../../utils/debugPreferences';

jest.mock('../../utils/debugPreferences', () => {
  const store = new Map<string, string>();
  return {
    getPreference: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setPreference: jest.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve(); }),
    _store: store,
  };
});

const mockGetPreference = getPreference as jest.Mock;
const mockSetPreference = setPreference as jest.Mock;

beforeEach(() => {
  mockGetPreference.mockClear();
  mockSetPreference.mockClear();
});

describe('createPersistedObservableStore', () => {
  it('restores entries from storage on creation', async () => {
    const entries = [{ id: '1', value: 'a' }, { id: '2', value: 'b' }];
    mockGetPreference.mockResolvedValueOnce(JSON.stringify(entries));

    const store = createPersistedObservableStore<{ id: string; value: string }>({
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 0,
    });

    // Wait for async restore
    await new Promise((r) => setTimeout(r, 10));

    expect(store.getData()).toHaveLength(2);
    expect(store.getData()[0]!.value).toBe('a');
  });

  it('nextId skips past restored entry IDs', async () => {
    const entries = [{ id: '5', value: 'x' }, { id: '8', value: 'y' }];
    mockGetPreference.mockResolvedValueOnce(JSON.stringify(entries));

    const store = createPersistedObservableStore<{ id: string; value: string }>({
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 0,
    });

    await new Promise((r) => setTimeout(r, 10));

    // nextId should start from 9 (max restored + 1)
    expect(store.nextId()).toBe('9');
    expect(store.nextId()).toBe('10');
  });

  it('persists pushed entries via setPreference', async () => {
    jest.useFakeTimers();
    mockGetPreference.mockResolvedValueOnce(null);

    const store = createPersistedObservableStore<{ id: string }>({
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 1000,
    });

    store.push({ id: '1' });
    store.push({ id: '2' });
    expect(mockSetPreference).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(mockSetPreference).toHaveBeenCalledWith('test_key', JSON.stringify([{ id: '1' }, { id: '2' }]));

    jest.useRealTimers();
  });

  it('respects maxPersist limit', async () => {
    jest.useFakeTimers();
    mockGetPreference.mockResolvedValueOnce(null);

    const store = createPersistedObservableStore<{ id: string }>({
      storageKey: 'test_key',
      maxPersist: 2,
      debounceMs: 100,
    });

    store.push({ id: '1' });
    store.push({ id: '2' });
    store.push({ id: '3' });

    jest.advanceTimersByTime(100);

    const written = JSON.parse(mockSetPreference.mock.calls[0][1]);
    expect(written).toHaveLength(2);
    expect(written[0].id).toBe('2');
    expect(written[1].id).toBe('3');

    jest.useRealTimers();
  });

  it('applies serialize function', async () => {
    jest.useFakeTimers();
    mockGetPreference.mockResolvedValueOnce(null);

    const store = createPersistedObservableStore<{ id: string; secret: string }>({
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 100,
      serialize: (entry) => ({ id: entry.id }),
    });

    store.push({ id: '1', secret: 'hidden' });

    jest.advanceTimersByTime(100);

    const written = JSON.parse(mockSetPreference.mock.calls[0][1]);
    expect(written).toEqual([{ id: '1' }]);

    jest.useRealTimers();
  });

  it('clear immediately writes empty array', async () => {
    jest.useFakeTimers();
    mockGetPreference.mockResolvedValueOnce(null);

    const store = createPersistedObservableStore<{ id: string }>({
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 100,
    });

    store.push({ id: '1' });
    store.clear();

    expect(mockSetPreference).toHaveBeenCalledWith('test_key', '[]');
    expect(store.getData()).toHaveLength(0);

    jest.useRealTimers();
  });

  it('notifies subscribers on restore', async () => {
    const listener = jest.fn();
    const entries = [{ id: '1' }];
    mockGetPreference.mockResolvedValueOnce(JSON.stringify(entries));

    const store = createPersistedObservableStore<{ id: string }>({
      storageKey: 'test_key',
      maxPersist: 50,
      debounceMs: 0,
    });
    store.subscribe(listener);

    await new Promise((r) => setTimeout(r, 10));

    expect(listener).toHaveBeenCalled();
  });
});
