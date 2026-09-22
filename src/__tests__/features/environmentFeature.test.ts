import { createEnvironmentFeature } from '../../features/environment';
import { createLogRuntime } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { KEYS } from '../../utils/debugPreferences';
import type { EnvironmentOptions } from '../../types/environment';
import { normalizeConfig } from '../../core/config';

class Xhr {
  url = '';
  open(_method: string, url: string) { this.url = url; }
  send() {}
  setRequestHeader() {}
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
}
const items = [
  { id: 'prod', title: 'Production', urls: { api: 'https://prod.test/api' } },
  { id: 'qa', title: 'QA', urls: { api: 'https://qa.test/v2' } },
];
const originalXhr = globalThis.XMLHttpRequest;
const originalOpen = Xhr.prototype.open;
const cleanup: Array<() => void> = [];
beforeEach(() => { globalThis.XMLHttpRequest = Xhr as unknown as typeof XMLHttpRequest; });
afterEach(() => { cleanup.splice(0).forEach(fn => fn()); globalThis.XMLHttpRequest = originalXhr; jest.restoreAllMocks(); });
function harness(config: EnvironmentOptions = { items }) {
  const disk = new MemoryStorageAdapter();
  const runtime = createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: new MemoryStorageAdapter(), preferenceDisk: disk });
  const feature = createEnvironmentFeature(config, runtime);
  const controller = new AbortController();
  const setStatus = jest.fn();
  const start = () => feature.start({ owner: Symbol(), signal: controller.signal, isCurrent: () => !controller.signal.aborted, setStatus });
  cleanup.push(() => { feature.dispose(); runtime.dispose(); });
  return { feature, disk, runtime, controller, setStatus, start };
}
function request() { const xhr = new Xhr(); xhr.open('GET', 'https://prod.test/api/users?q=1#top'); xhr.send(); return xhr; }
function deferred() { let resolve!: () => void; let reject!: (error: Error) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test('empty items ignore historical selection and allocate no rewrite or preference work', async () => {
  const onChange = jest.fn(); const h = harness({ items: [], defaultId: 'prod', onChange });
  await h.disk.setItem(KEYS.environmentId, 'qa');
  const read = jest.spyOn(h.runtime.preferenceStorage, 'getItem');
  await h.start();
  expect(read).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled();
  expect(Xhr.prototype.open).toBe(originalOpen);
  expect(h.setStatus).toHaveBeenLastCalledWith({ phase: 'empty', issues: [] });
});
test.each([null, 'deleted', 'qa'])('restores valid saved selection or default: %s', async saved => {
  const onChange = jest.fn(); const h = harness({ items, onChange });
  if (saved) { await h.disk.setItem(KEYS.environmentId, saved); }
  await h.start();
  expect(h.feature.getSnapshot().currentEnvironmentId).toBe(saved === 'qa' ? 'qa' : 'prod');
  expect(onChange).toHaveBeenCalledWith(items[saved === 'qa' ? 1 : 0]);
});
test('switch applies immediately, serializes callback, persists after success, and restores default', async () => {
  const wait = deferred(); const onChange = jest.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(wait.promise);
  const h = harness({ items, onChange }); await h.start();
  const switching = h.feature.switchEnvironment('qa');
  expect(request().url).toBe('https://qa.test/v2/users?q=1#top');
  expect(h.feature.getSnapshot().busy).toBe(true);
  await h.feature.switchEnvironment('prod');
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(await h.disk.getItem(KEYS.environmentId)).toBeNull();
  wait.resolve(); await switching;
  expect(await h.disk.getItem(KEYS.environmentId)).toBe('qa');
  await h.feature.restoreDefaultEnvironment();
  expect(h.feature.getSnapshot()).toMatchObject({ currentEnvironmentId: 'prod', busy: false, error: null });
  expect(request().url).toBe('https://prod.test/api/users?q=1#top');
  expect(Xhr.prototype.open).toBe(originalOpen);
});
test('failed callback restores previous SDK selection and does not persist', async () => {
  const h = harness({ items, onChange: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('business failed')) }); await h.start();
  await h.feature.switchEnvironment('qa');
  expect(h.feature.getSnapshot()).toMatchObject({ currentEnvironmentId: 'prod', busy: false, error: 'business failed' });
  expect(request().url).toContain('prod.test'); expect(await h.disk.getItem(KEYS.environmentId)).toBeNull();
  expect(h.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
});
test('initial callback failure falls back to default without overwriting saved choice', async () => {
  const h = harness({ items, onChange: () => { throw new Error('startup failed'); } });
  await h.disk.setItem(KEYS.environmentId, 'qa'); await h.start();
  expect(h.feature.getSnapshot()).toMatchObject({ currentEnvironmentId: 'prod', error: 'startup failed', busy: false });
  expect(request().url).toContain('prod.test'); expect(await h.disk.getItem(KEYS.environmentId)).toBe('qa');
});
test.each(['resolve', 'reject'] as const)('cancelled callback cannot persist or affect replacement: %s', async result => {
  const wait = deferred(); const h = harness({ items, onChange: jest.fn().mockResolvedValueOnce(undefined).mockReturnValueOnce(wait.promise) }); await h.start();
  const switching = h.feature.switchEnvironment('qa'); h.controller.abort();
  const next = harness(); await next.disk.setItem(KEYS.environmentId, 'qa'); await next.start();
  const statusCalls = h.setStatus.mock.calls.length;
  if (result === 'resolve') { wait.resolve(); } else { wait.reject(new Error('late')); }
  await switching;
  expect(await h.disk.getItem(KEYS.environmentId)).toBeNull();
  expect(h.setStatus).toHaveBeenCalledTimes(statusCalls);
  expect(request().url).toContain('qa.test');
});
test('cancellation while preference read is pending never applies saved environment', async () => {
  const h = harness(); let resolve!: (id: string) => void;
  jest.spyOn(h.runtime.preferenceStorage, 'getItem').mockImplementation(() => new Promise(done => { resolve = done; }));
  const starting = h.start(); h.controller.abort(); resolve('qa'); await starting;
  expect(Xhr.prototype.open).toBe(originalOpen); expect(h.feature.getSnapshot().currentEnvironmentId).toBeNull();
});
test('environment alone rewrites without enabling network collection', async () => {
  const h = harness(); await h.start(); await h.feature.switchEnvironment('qa');
  const now = jest.spyOn(Date, 'now'); const xhr = request();
  expect(xhr.url).toContain('qa.test'); expect(xhr.addEventListener).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled();
});

test('accepts the canonical empty options produced by root normalization', async () => {
  const h = harness(normalizeConfig().features.environment.options as EnvironmentOptions);
  await h.start();
  expect(h.setStatus).toHaveBeenLastCalledWith({ phase: 'empty', issues: [] });
});
