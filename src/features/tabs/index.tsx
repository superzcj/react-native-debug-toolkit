import type { ComponentType } from 'react';
import { normalizeConfig } from '../../core/config';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';
import type { DebugTab } from '../../types/config';
import type { DebugFeature, FeatureConfig } from '../../types/feature';
import { observeSource } from '../../utils/observeSource';
import { TabsTab } from './TabsTab';

export interface TabsItemState {
  id: string;
  title: string;
  component: ComponentType<{ snapshot?: unknown }>;
  hasSource: boolean;
  snapshot?: unknown;
  badge: { label: string; color: string } | null;
  canClear: boolean;
  error?: string;
}
export interface TabsSnapshot { items: readonly TabsItemState[]; error?: string }
export interface TabsFeature extends DebugFeature<TabsSnapshot>, FeatureDriver {
  actions: { clear(id: string): void };
}

export function createTabsFeature<S extends readonly unknown[] = readonly never[]>(
  config: FeatureConfig<{ items?: { readonly [K in keyof S]: DebugTab<S[K]> } }> = {},
): TabsFeature {
  const parsed = normalizeConfig({ tabs: config }).features.tabs;
  // Heterogeneous page snapshots remain paired with their own source/component.
  const items = parsed.options.items as readonly DebugTab<unknown>[];
  const listeners = new Set<() => void>();
  let snapshot: TabsSnapshot = { items: [], ...(parsed.issues.length ? { error: parsed.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n') } : {}) };
  let active: { context: FeatureContext; controller: AbortController; cleanups: (() => void)[] } | undefined;
  const emit = () => { listeners.forEach(listener => { try { listener(); } catch { /* Subscriber isolation. */ } }); };
  const update = (id: string, patch: Partial<TabsItemState>) => {
    snapshot = { ...snapshot, items: snapshot.items.map(item => item.id === id ? { ...item, ...patch } : item) };
    emit();
  };
  const message = (error: unknown) => error instanceof Error ? error.message : 'Custom page failed.';
  const dispose = () => {
    const previous = active;
    if (!previous) { return; }
    active = undefined;
    previous.context.signal.removeEventListener('abort', dispose);
    previous.controller.abort();
    for (const cleanup of previous.cleanups.reverse()) {
      try { cleanup(); } catch { /* A failed deactivation must not skip remaining releases. */ }
    }
  };
  const feature: TabsFeature = {
    name: 'tabs', label: 'Custom', status: { phase: 'initializing', issues: [] }, renderContent: TabsTab,
    setup() {}, cleanup: dispose, dispose,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    actions: {
      clear(id) {
        const run = active;
        if (!run || !run.context.isCurrent() || run.controller.signal.aborted) { return; }
        const item = items.find(candidate => candidate.id === id);
        if (!item || snapshot.items.find(candidate => candidate.id === id)?.error) { return; }
        try { item.onClear?.(); } catch (error) { if (active === run) { update(id, { error: message(error) }); } }
      },
    },
    start(context) {
      if (active || context.signal.aborted || !context.isCurrent()) { return; }
      if (!parsed.enabled) { return; }
      if (parsed.issues.length) { context.setStatus({ phase: 'error', issues: parsed.issues }); return; }
      const run = { context, controller: new AbortController(), cleanups: [] as (() => void)[] };
      active = run;
      context.signal.addEventListener('abort', dispose, { once: true });
      const current = () => active === run && context.isCurrent() && !run.controller.signal.aborted;
      snapshot = { items: items.map(item => ({ id: item.id, title: item.title,
        component: item.component as ComponentType<{ snapshot?: unknown }>, hasSource: !!item.source,
        badge: null, canClear: !!item.onClear })) };
      const badge = (item: DebugTab<unknown>, value?: unknown) => {
        try { return item.badge ? item.badge(value) : null; }
        catch (error) { if (current()) { update(item.id, { error: message(error) }); } return null; }
      };
      for (const item of items) {
        if (!current()) { break; }
        if (item.onDeactivate) { run.cleanups.push(item.onDeactivate); }
        try { item.onActivate?.(); }
        catch (error) { if (current()) { update(item.id, { error: message(error) }); } continue; }
        if (!current()) { break; }
        if (item.source) {
          const stop = observeSource(item.source, { signal: run.controller.signal,
            onSnapshot(value) {
              if (!current()) { return; }
              const nextBadge = badge(item, value);
              if (current()) { update(item.id, { snapshot: value, badge: nextBadge }); }
            },
            onError(error) { if (current()) { update(item.id, { error: message(error) }); } },
          });
          run.cleanups.push(stop);
        } else {
          const nextBadge = badge(item);
          if (current()) { update(item.id, { badge: nextBadge }); }
        }
      }
      if (current()) { emit(); }
      if (current()) { context.setStatus({ phase: items.length ? 'ready' : 'empty', issues: [] }); }
    },
  };
  return feature;
}
