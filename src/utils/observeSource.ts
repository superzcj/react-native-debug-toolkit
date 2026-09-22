import type { DebugSource } from '../types/source';

/** Sources own snapshot identity; observers contain failures and close the read/subscribe gap. */
export function observeSource<T>(source: DebugSource<T>, options: {
  signal: AbortSignal;
  onSnapshot(value: T): void;
  onError(error: unknown): void;
}): () => void {
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let hasValue = false;
  let previous: T;
  const report = (error: unknown) => {
    try { options.onError(error); } catch { /* An error handler must not escape into the source. */ }
  };
  const release = () => {
    const cleanup = unsubscribe;
    unsubscribe = undefined;
    try { cleanup?.(); } catch (error) { report(error); }
  };
  const stop = () => {
    closed = true;
    options.signal.removeEventListener('abort', stop);
    release();
  };
  const read = () => {
    if (closed) {return;}
    try {
      const value = source.getSnapshot();
      if (closed || (hasValue && Object.is(value, previous))) {return;}
      previous = value;
      hasValue = true;
      options.onSnapshot(value);
    } catch (error) {
      stop();
      report(error);
    }
  };
  if (options.signal.aborted) {return stop;}
  options.signal.addEventListener('abort', stop, { once: true });
  read();
  if (!closed) {
    try {
      unsubscribe = source.subscribe(read);
      // A synchronous callback can fail or cancel while subscribe is still running.
      if (closed) {release();}
      else {read();}
    } catch (error) { stop(); report(error); }
  }
  return stop;
}
