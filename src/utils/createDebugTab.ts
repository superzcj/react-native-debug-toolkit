import type { ComponentType } from 'react';
import type { DebugFeature, DebugFeatureListener, DebugFeatureRenderProps } from '../types';

export interface CreateDebugTabOptions<TSnapshot> {
  name: string;
  label: string;
  getSnapshot: () => TSnapshot;
  render?: ComponentType<DebugFeatureRenderProps<TSnapshot>>;
  setup?: () => void;
  cleanup?: () => void;
  clear?: () => void;
  subscribe?: (listener: DebugFeatureListener) => () => void;
  badge?: () => { label: string; color: string } | null;
}

const noop = () => {};

export function createDebugTab<TSnapshot>(
  options: CreateDebugTabOptions<TSnapshot>,
): DebugFeature<TSnapshot> {
  return {
    name: options.name,
    label: options.label,
    setup: options.setup ?? noop,
    cleanup: options.cleanup ?? noop,
    getSnapshot: options.getSnapshot,
    clear: options.clear,
    subscribe: options.subscribe,
    renderContent: options.render,
    badge: options.badge,
  };
}
