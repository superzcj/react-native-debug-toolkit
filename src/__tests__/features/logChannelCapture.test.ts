import { createLogChannelFeature } from '../../features/logChannels';
import { createLogRuntime } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
const options = { id: 'ble', title: '蓝牙', maxLogs: 1000, maxBytes: 2097152 };
function runtime(disk = new MemoryStorageAdapter()) {
  return createLogRuntime({
    history: { enabled: true, maxSessions: 5 },
    logDisk: disk,
    preferenceDisk: new MemoryStorageAdapter(),
  });
}
const ctx = () => ({
  owner: Symbol(),
  signal: new AbortController().signal,
  isCurrent: () => true,
  setStatus: jest.fn(),
});
afterEach(() => jest.useRealTimers());
test('capture preserves original data and timestamp while summary remains separate', async () => {
  const r = runtime(),
    f = createLogChannelFeature(options, r);
  expect(f.record({ message: 'before' })).toBe('not_ready');
  await f.start(ctx());
  const data = {
    frame: { plaintextPdu: '00 01 ff', ciphertext: 'aa bb' },
    requestId: 2,
  };
  expect(
    f.record({
      message: 'raw',
      summary: '已发送',
      timestamp: 123,
      data,
      source: { id: 'one', sequence: 1 },
    }),
  ).toBe('recorded');
  data.frame.plaintextPdu = 'mutated';
  const snapshot = f.getSnapshot();
  expect(snapshot[0]).toMatchObject({
    timestamp: 123,
    message: 'raw',
    summary: '已发送',
    data: { frame: { plaintextPdu: '00 01 ff' } },
  });
  (snapshot[0]!.data as typeof data).frame.plaintextPdu = 'subscriber';
  expect((f.getSnapshot()[0]!.data as typeof data).frame.plaintextPdu).toBe(
    '00 01 ff',
  );
  f.dispose();
  r.dispose();
});
test('clear retains source watermarks and IDs and stops old replay without swallowing another runtime', async () => {
  const r = runtime(),
    f = createLogChannelFeature(options, r);
  await f.start(ctx());
  f.record({ message: 'one', source: { id: 'old', sequence: 1 } });
  const first = f.getSnapshot()[0]!.id;
  f.clear();
  expect(
    f.record({ message: 'replay', source: { id: 'old', sequence: 1 } }),
  ).toBe('duplicate');
  expect(
    f.record({ message: 'new runtime', source: { id: 'new', sequence: 1 } }),
  ).toBe('recorded');
  expect(f.getSnapshot()[0]!.id).not.toBe(first);
  f.dispose();
  r.dispose();
});
test('history restores raw records and watermarks after clear', async () => {
  jest.useFakeTimers();
  const disk = new MemoryStorageAdapter(),
    r = runtime(disk);
  const first = createLogChannelFeature(options, r);
  await first.start(ctx());
  first.record({ message: 'a', source: { id: 'sdk', sequence: 7 } });
  first.clear();
  await Promise.resolve();
  first.dispose();
  const next = createLogChannelFeature(options, r);
  await next.start(ctx());
  expect(next.getSnapshot()).toEqual([]);
  expect(
    next.record({ message: 'replay', source: { id: 'sdk', sequence: 7 } }),
  ).toBe('duplicate');
  next.record({ message: 'next', source: { id: 'sdk', sequence: 8 } });
  jest.advanceTimersByTime(1000);
  await Promise.resolve();
  const stored = await r.sessionManager.loadSessionLogs(
    r.sessionManager.getCurrentSession().id,
    'channel.ble',
  );
  expect(stored).toEqual([expect.objectContaining({ message: 'next' })]);
  next.dispose();
  r.dispose();
});
test('byte and count budgets evict oldest records but never hide process records from raw export', async () => {
  const r = runtime(),
    f = createLogChannelFeature({ ...options, maxBytes: 16384, maxLogs: 3 }, r);
  await f.start(ctx());
  for (let i = 0; i < 4; i++)
    {f.record({ message: String(i), detail: true, data: 'x'.repeat(5000) });}
  const rows = f.getSnapshot();
  expect(rows.length).toBeLessThanOrEqual(3);
  expect(rows.at(-1)!.message).toBe('3');
  expect(rows.every((row) => row.detail)).toBe(true);
  expect(
    new TextEncoder().encode(JSON.stringify(rows)).length,
  ).toBeLessThanOrEqual(16384);
  f.dispose();
  r.dispose();
});
test('oversize data marks truncation and does not erase identity, category or source', async () => {
  const r = runtime(),
    f = createLogChannelFeature(options, r);
  await f.start(ctx());
  expect(
    f.record({
      message: 'frame',
      category: 'rx',
      source: { id: 'sdk', sequence: 1 },
      data: { body: 'x'.repeat(20000) },
    }),
  ).toBe('recorded');
  const row = f.getSnapshot()[0]!;
  expect(row).toMatchObject({
    message: 'frame',
    category: 'rx',
    source: { id: 'sdk', sequence: 1 },
    truncated: true,
  });
  expect(row.originalBytes).toBeGreaterThan(20000);
  expect(
    new TextEncoder().encode(JSON.stringify(row)).length,
  ).toBeLessThanOrEqual(16384);
  f.dispose();
  r.dispose();
});
test('observer exceptions and invalid calls cannot break accepted logging or escape into SDK', async () => {
  const r = runtime(),
    f = createLogChannelFeature(options, r);
  await f.start(ctx());
  f.subscribe(() => {
    throw Error('observer');
  });
  expect(() => f.record({ message: 'valid' })).not.toThrow();
  expect(f.getSnapshot()).toHaveLength(1);
  expect(f.record({ message: 'invalid', timestamp: NaN })).toBe('invalid');
  expect(
    f.record(
      Object.defineProperty({}, 'message', {
        get() {
          throw Error('getter');
        },
      }) as never,
    ),
  ).toBe('invalid');
  f.dispose();
  expect(f.record({ message: 'late' })).toBe('disabled');
  r.dispose();
});

test('many source IDs cannot grow a small channel envelope beyond its byte budget', async () => {
  jest.useFakeTimers();
  const disk = new MemoryStorageAdapter(),
    r = runtime(disk),
    f = createLogChannelFeature({ ...options, maxBytes: 16384 }, r);
  await f.start(ctx());
  for (let i = 0; i < 140; i++)
    {f.record({
      message: 'x',
      source: { id: String(i).padEnd(160, 'x'), sequence: 1 },
    });}
  jest.advanceTimersByTime(1000);
  await Promise.resolve();
  const raw = await disk.getItem(
    r.sessionManager.getLogStorageKey('channel.ble'),
  );
  expect(new TextEncoder().encode(raw!).length).toBeLessThanOrEqual(16384);
  f.dispose();
  r.dispose();
});

test('entry budget reserves UTF-8 title and source envelope space, including restored limits', async () => {
  jest.useFakeTimers();
  const disk = new MemoryStorageAdapter(),
    r = runtime(disk);
  const config = { ...options, maxBytes: 16384, title: '蓝'.repeat(80) };
  const first = createLogChannelFeature(config, r);
  await first.start(ctx());
  expect(
    first.record({
      message: 'payload',
      source: { id: 's'.repeat(160), sequence: 1 },
      data: 'x'.repeat(15800),
    }),
  ).toBe('recorded');
  jest.advanceTimersByTime(1000);
  await Promise.resolve();
  expect(first.getSnapshot()[0]!.truncated).toBe(true);
  const key = r.sessionManager.getLogStorageKey('channel.ble');
  expect(
    new TextEncoder().encode((await disk.getItem(key))!).length,
  ).toBeLessThanOrEqual(16384);
  first.dispose();
  await disk.setItem(
    key,
    JSON.stringify({
      entries: [],
      nextId: 140,
      sources: Array.from({ length: 128 }, (_, i) => [
        String(i).padEnd(160, 'z'),
        1,
      ]),
    }),
  );
  // Use a fresh runtime because its resilient memory cache intentionally owns newer writes.
  const fresh = runtime(disk);
  jest.spyOn(fresh.sessionManager, 'getLogStorageKey').mockReturnValue(key);
  const restored = createLogChannelFeature(config, fresh);
  await restored.start(ctx());
  restored.clear();
  await Promise.resolve();
  expect(
    new TextEncoder().encode((await disk.getItem(key))!).length,
  ).toBeLessThanOrEqual(16384);
  restored.dispose();
  fresh.dispose();
  r.dispose();
});
