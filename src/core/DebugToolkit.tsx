import type { AnyDebugFeature } from '../types';

type Listener = () => void;

const listeners = new Set<Listener>();
let _features: AnyDebugFeature[] = [];
let _launcherVisible = false;
let _panelOpen = false;
let _enabled = true;

function notify(): void {
  listeners.forEach((l) => l());
}

function setupFeature(feature: AnyDebugFeature): void {
  feature.setup?.();
}

function cleanupFeature(feature: AnyDebugFeature): void {
  feature.cleanup?.();
}

export const DebugToolkit = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  get features(): AnyDebugFeature[] {
    return [..._features];
  },

  get enabled(): boolean {
    return _enabled;
  },

  get launcherVisible(): boolean {
    return _launcherVisible;
  },

  setEnabled(enabled: boolean): void {
    if (_enabled === enabled) return;
    _enabled = enabled;
    if (!enabled) {
      _launcherVisible = false;
      _features.forEach(cleanupFeature);
      _features = [];
    }
    notify();
  },

  replaceFeatures(features: AnyDebugFeature[]): void {
    if (!_enabled) return;
    const next = features.filter(
      (f, i, arr) =>
        f && typeof f.name === 'string' && arr.findIndex((item) => item.name === f.name) === i,
    );
    const prevMap = new Map(_features.map((f) => [f.name, f]));
    const nextMap = new Map(next.map((f) => [f.name, f]));

    _features.forEach((f) => {
      if (!nextMap.get(f.name) || nextMap.get(f.name) !== f) cleanupFeature(f);
    });
    next.forEach((f) => {
      if (!prevMap.get(f.name) || prevMap.get(f.name) !== f) setupFeature(f);
    });

    _features = next;
    notify();
  },

  addFeature(feature: AnyDebugFeature): void {
    if (!_enabled || !feature || typeof feature.name !== 'string') {
      return;
    }

    const existingIndex = _features.findIndex((f) => f.name === feature.name);
    if (existingIndex >= 0) {
      const existing = _features[existingIndex]!;
      if (existing === feature) {
        return;
      }

      cleanupFeature(existing);
      setupFeature(feature);
      _features = [
        ..._features.slice(0, existingIndex),
        feature,
        ..._features.slice(existingIndex + 1),
      ];
      notify();
      return;
    }

    setupFeature(feature);
    _features = [..._features, feature];
    notify();
  },

  removeFeature(name: string): void {
    if (!_enabled) {
      return;
    }

    const feature = _features.find((f) => f.name === name);
    if (!feature) {
      return;
    }

    cleanupFeature(feature);
    _features = _features.filter((f) => f.name !== name);
    if (_features.length === 0) {
      _launcherVisible = false;
    }
    notify();
  },

  reset(): void {
    _launcherVisible = false;
    _panelOpen = false;
    _features.forEach(cleanupFeature);
    _features = [];
    notify();
  },

  hasFeatures(): boolean {
    return _features.length > 0;
  },

  get panelOpen(): boolean {
    return _panelOpen;
  },

  openPanel(): void {
    if (!_enabled || _panelOpen) return;
    _panelOpen = true;
    notify();
  },

  closePanel(): void {
    if (!_panelOpen) return;
    _panelOpen = false;
    notify();
  },

  togglePanel(): void {
    if (_panelOpen) {
      DebugToolkit.closePanel();
    } else {
      DebugToolkit.openPanel();
    }
  },

  showLauncher(): void {
    if (!_enabled) return;
    _launcherVisible = true;
    notify();
  },

  hideLauncher(): void {
    _launcherVisible = false;
    notify();
  },

  clearAll(): void {
    _features.forEach((f) => f.clear?.());
    notify();
  },

  destroy(): void {
    DebugToolkit.reset();
    listeners.clear();
  },
};
