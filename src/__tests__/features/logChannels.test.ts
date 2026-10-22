import { normalizeConfig } from '../../core/config';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';

test('configured log channels are independent first-level features with validated IDs', () => {
  const config = normalizeConfig({
    logChannels: [
      { id: 'ble', title: '蓝牙', maxLogs: 1000, maxBytes: 2097152 },
    ],
  });
  expect(config.issues).toEqual([]);
  expect(Object.values(config.features)).toContainEqual(
    expect.objectContaining({
      key: 'channel.ble',
      enabled: true,
      options: expect.objectContaining({ title: '蓝牙' }),
    }),
  );
  const invalid = normalizeConfig({
    logChannels: [
      { id: 'bad.key', title: 'Bad' },
      { id: 'ble', title: 'One' },
      { id: 'ble', title: 'Two' },
    ],
  });
  expect(invalid.issues.length).toBeGreaterThan(0);
});
test('continuous writes persist before maxWait rather than resetting debounce forever', async () => {
  jest.useFakeTimers();
  const disk = new MemoryStorageAdapter();
  const store = createPersistedObservableStore({
    storage: disk,
    storageKey: 'continuous',
    maxPersist: 1000,
    debounceMs: 2000,
    maxWaitMs: 1000,
  } as Parameters<typeof createPersistedObservableStore>[0]);
  await store.ready;
  for (let i = 0; i < 10; i++) {
    store.push({ id: String(i) });
    jest.advanceTimersByTime(100);
  }
  expect(JSON.parse((await disk.getItem('continuous'))!)).toHaveLength(10);
  store.dispose();
  jest.useRealTimers();
});
