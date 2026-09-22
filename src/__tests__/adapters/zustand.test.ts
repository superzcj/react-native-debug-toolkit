import { zustandAdapter } from '../../adapters/zustand';
import { observeSource } from '../../utils/observeSource';

test('forwards store snapshots with stable identity and releases the original subscription', () => {
  let state = { count: 0 };
  let callback!: (next: typeof state, prev: typeof state) => void;
  const release = jest.fn();
  const store = { getState: () => state, subscribe(listener: typeof callback) { callback = listener; return release; } };
  const adapter = zustandAdapter('cart', store);
  expect(adapter.id).toBe('cart');
  expect(adapter.getSnapshot()).toBe(state);
  expect(adapter.getSnapshot()).toBe(adapter.getSnapshot());
  const onSnapshot = jest.fn();
  const stop = observeSource(adapter, { signal: new AbortController().signal, onSnapshot, onError: jest.fn() });
  const previous = state; state = { count: 1 }; callback(state, previous);
  expect(onSnapshot.mock.calls).toEqual([[{ count: 0 }], [{ count: 1 }]]);
  stop(); expect(release).toHaveBeenCalledTimes(1);
});
