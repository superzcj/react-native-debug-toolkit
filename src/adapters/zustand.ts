import type { StateAdapter } from '../types/source';

/** Structural adapter: no Zustand runtime dependency or invented action names. */
export function zustandAdapter<T>(id: string, store: {
  getState(): T;
  subscribe(listener: (state: T, previousState: T) => void): () => void;
}): StateAdapter<T> {
  return {
    id,
    getSnapshot: () => store.getState(),
    subscribe: listener => store.subscribe(() => listener()),
  };
}
