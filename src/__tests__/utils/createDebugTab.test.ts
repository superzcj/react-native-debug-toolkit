import React from 'react';
import { createDebugTab } from '../../utils/createDebugTab';
import type { DebugFeatureRenderProps } from '../../types';

describe('createDebugTab', () => {
  it('creates a debug feature from tab options', () => {
    const setup = jest.fn();
    const cleanup = jest.fn();
    const clear = jest.fn();
    const listener = jest.fn();
    const unsubscribe = jest.fn();
    const subscribe = jest.fn(() => unsubscribe);
    const badge = jest.fn(() => ({ label: '2', color: '#ff0000' }));

    function RenderTab({ snapshot }: DebugFeatureRenderProps<{ count: number }>) {
      return React.createElement('Text', null, String(snapshot.count));
    }

    const feature = createDebugTab({
      name: 'user',
      label: 'User',
      setup,
      cleanup,
      clear,
      subscribe,
      badge,
      getSnapshot: () => ({ count: 2 }),
      render: RenderTab,
    });

    expect(feature.name).toBe('user');
    expect(feature.label).toBe('User');
    expect(feature.getSnapshot()).toEqual({ count: 2 });
    expect(feature.renderContent).toBe(RenderTab);

    feature.setup();
    feature.cleanup();
    feature.clear?.();
    expect(feature.subscribe?.(listener)).toBe(unsubscribe);
    expect(feature.badge?.()).toEqual({ label: '2', color: '#ff0000' });

    expect(setup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(listener);
    expect(badge).toHaveBeenCalledTimes(1);
  });

  it('provides safe default lifecycle methods', () => {
    const feature = createDebugTab({
      name: 'state',
      label: 'State',
      getSnapshot: () => 'ok',
    });

    expect(() => feature.setup()).not.toThrow();
    expect(() => feature.cleanup()).not.toThrow();
    expect(feature.getSnapshot()).toBe('ok');
  });
});
