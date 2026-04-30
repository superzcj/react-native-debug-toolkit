export type EventListener<TEvent> = (event: TEvent) => void;

export interface EventChannel<TEvent> {
  emit: (event: TEvent) => void;
  subscribe: (listener: EventListener<TEvent>) => () => void;
}

export function createEventChannel<TEvent>(): EventChannel<TEvent> {
  const listeners = new Set<EventListener<TEvent>>();

  return {
    emit: (event) => {
      listeners.forEach((listener) => listener(event));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
