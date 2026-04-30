import { createEventChannel } from '../../utils/createEventChannel';

describe('createEventChannel', () => {
  it('delivers events to subscribers', () => {
    const channel = createEventChannel<string>();
    const listener = jest.fn();
    channel.subscribe(listener);
    channel.emit('hello');
    expect(listener).toHaveBeenCalledWith('hello');
  });

  it('delivers to multiple subscribers', () => {
    const channel = createEventChannel<number>();
    const l1 = jest.fn();
    const l2 = jest.fn();
    channel.subscribe(l1);
    channel.subscribe(l2);
    channel.emit(42);
    expect(l1).toHaveBeenCalledWith(42);
    expect(l2).toHaveBeenCalledWith(42);
  });

  it('stops delivery after unsubscribe', () => {
    const channel = createEventChannel<string>();
    const listener = jest.fn();
    const unsub = channel.subscribe(listener);
    unsub();
    channel.emit('test');
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not affect other subscribers when one unsubscribes', () => {
    const channel = createEventChannel<string>();
    const l1 = jest.fn();
    const l2 = jest.fn();
    const unsub1 = channel.subscribe(l1);
    channel.subscribe(l2);
    unsub1();
    channel.emit('test');
    expect(l1).not.toHaveBeenCalled();
    expect(l2).toHaveBeenCalledWith('test');
  });
});
