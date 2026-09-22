export interface DebugSource<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

export interface StateAdapter<T = unknown> extends DebugSource<T> {
  id: string;
}
