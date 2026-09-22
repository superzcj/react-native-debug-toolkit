import { observeSource } from '../../utils/observeSource';

test('reads again after subscribing and deduplicates unchanged snapshots', () => {
  let value = 1;
  let notify!: () => void;
  const release = jest.fn();
  const onSnapshot = jest.fn();
  const controller = new AbortController();
  const stop = observeSource({ getSnapshot: () => value, subscribe(listener) {
    value = 2; notify = listener; return release;
  } }, { signal: controller.signal, onSnapshot, onError: jest.fn() });
  notify();
  expect(onSnapshot.mock.calls).toEqual([[1], [2]]);
  controller.abort(); stop(); notify();
  expect(release).toHaveBeenCalledTimes(1);
  expect(onSnapshot).toHaveBeenCalledTimes(2);
});

test.each(['read', 'subscribe', 'listener', 'unsubscribe'])('%s failures are contained and stop observation', kind => {
  let notify!: () => void;
  let value = 1;
  const release = jest.fn(() => { if (kind === 'unsubscribe') {throw new Error('release');} });
  const onError = jest.fn();
  const onSnapshot = jest.fn(() => { if (kind === 'listener') {throw new Error('listener');} });
  const stop = observeSource({
    getSnapshot() { if (kind === 'read' && value === 2) {throw new Error('read');} return value; },
    subscribe(listener) { notify = listener; if (kind === 'subscribe') {throw new Error('subscribe');} return release; },
  }, { signal: new AbortController().signal, onSnapshot, onError });
  value = 2;
  expect(() => { notify?.(); stop(); stop(); }).not.toThrow();
  expect(onError).toHaveBeenCalledTimes(1);
  if (kind === 'read' || kind === 'unsubscribe') {expect(release).toHaveBeenCalledTimes(1);}
});

test('synchronous subscription callbacks can fail before unsubscribe is returned', () => {
  let value = 0;
  const release = jest.fn();
  const onError = jest.fn();
  observeSource({ getSnapshot: () => value, subscribe(listener) { value++; listener(); return release; } }, {
    signal: new AbortController().signal,
    onSnapshot(snapshot) { if (snapshot === 1) {throw new Error('invalid');} }, onError,
  });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});

test('already aborted source is not read or subscribed', () => {
  const controller = new AbortController(); controller.abort();
  const source = { getSnapshot: jest.fn(), subscribe: jest.fn() };
  observeSource(source, { signal: controller.signal, onSnapshot: jest.fn(), onError: jest.fn() });
  expect(source.getSnapshot).not.toHaveBeenCalled();
  expect(source.subscribe).not.toHaveBeenCalled();
});
