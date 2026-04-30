import { createObservableStore } from '../../utils/createObservableStore';

describe('createObservableStore', () => {
  it('starts empty', () => {
    const store = createObservableStore<number>();
    expect(store.getData()).toEqual([]);
  });

  it('pushes items', () => {
    const store = createObservableStore<number>();
    store.push(1);
    store.push(2);
    expect(store.getData()).toEqual([1, 2]);
  });

  it('respects maxEntries', () => {
    const store = createObservableStore<number>();
    store.push(1);
    store.push(2);
    store.push(3, 2);
    expect(store.getData()).toEqual([2, 3]);
  });

  it('clears data', () => {
    const store = createObservableStore<number>();
    store.push(1);
    store.push(2);
    store.clear();
    expect(store.getData()).toEqual([]);
  });

  it('does not notify on empty clear', () => {
    const store = createObservableStore<number>();
    const listener = jest.fn();
    store.subscribe(listener);
    store.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies listeners on push', () => {
    const store = createObservableStore<number>();
    const listener = jest.fn();
    store.subscribe(listener);
    store.push(42);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies listeners on clear', () => {
    const store = createObservableStore<number>();
    const listener = jest.fn();
    store.push(1);
    store.subscribe(listener);
    store.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes correctly', () => {
    const store = createObservableStore<number>();
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.push(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns data array on each call', () => {
    const store = createObservableStore<number>();
    store.push(1);
    store.push(2);
    expect(store.getData()).toEqual([1, 2]);
    expect(store.getData()).toEqual([1, 2]);
  });
});
