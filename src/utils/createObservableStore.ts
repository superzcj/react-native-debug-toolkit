export type StoreListener = () => void;

export interface ObservableStore<T> {
  getData: () => T[];
  push: (item: T, maxEntries?: number) => void;
  pushBatch: (items: T[]) => void;
  clear: () => void;
  subscribe: (listener: StoreListener) => () => void;
}

export function createObservableStore<T>(): ObservableStore<T> {
  let data: T[] = [];
  const listeners = new Set<StoreListener>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getData: () => data,
    push: (item, maxEntries) => {
      if (maxEntries && data.length >= maxEntries) {
        data = [...data.slice(data.length - maxEntries + 1), item];
      } else {
        data = [...data, item];
      }
      notify();
    },
    pushBatch: (items) => {
      if (items.length === 0) return;
      data = [...data, ...items];
      notify();
    },
    clear: () => {
      if (data.length === 0) {
        return;
      }
      data = [];
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
