import type { AnyDebugFeature, DebugFeatureListener, FeatureDataProvider } from '../types';

class DebugToolkitCore implements FeatureDataProvider {
  private _features: AnyDebugFeature[] = [];
  private _launcherVisible = false;
  private _panelOpen = false;
  private _enabled = true;
  private _listeners = new Set<DebugFeatureListener>();

  private notify(): void {
    this._listeners.forEach((l) => l());
  }

  // --- FeatureDataProvider ---

  get features(): AnyDebugFeature[] {
    return [...this._features];
  }

  subscribe(listener: DebugFeatureListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  // --- Enabled ---

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    if (!enabled) {
      this._launcherVisible = false;
      this._features.forEach((f) => f.cleanup?.());
      this._features = [];
    }
    this.notify();
  }

  // --- Feature Management ---

  replaceFeatures(features: AnyDebugFeature[]): void {
    if (!this._enabled) return;
    const next = features.filter(
      (f, i, arr) =>
        f && typeof f.name === 'string' && arr.findIndex((item) => item.name === f.name) === i,
    );
    const prevMap = new Map(this._features.map((f) => [f.name, f]));
    const nextMap = new Map(next.map((f) => [f.name, f]));

    this._features.forEach((f) => {
      if (!nextMap.get(f.name) || nextMap.get(f.name) !== f) f.cleanup?.();
    });
    next.forEach((f) => {
      if (!prevMap.get(f.name) || prevMap.get(f.name) !== f) f.setup?.();
    });

    this._features = next;
    this.notify();
  }

  addFeature(feature: AnyDebugFeature): void {
    if (!this._enabled || !feature || typeof feature.name !== 'string') {
      return;
    }

    const existingIndex = this._features.findIndex((f) => f.name === feature.name);
    if (existingIndex >= 0) {
      const existing = this._features[existingIndex]!;
      if (existing === feature) {
        return;
      }

      existing.cleanup?.();
      feature.setup?.();
      this._features = [
        ...this._features.slice(0, existingIndex),
        feature,
        ...this._features.slice(existingIndex + 1),
      ];
      this.notify();
      return;
    }

    feature.setup?.();
    this._features = [...this._features, feature];
    this.notify();
  }

  removeFeature(name: string): void {
    if (!this._enabled) {
      return;
    }

    const feature = this._features.find((f) => f.name === name);
    if (!feature) {
      return;
    }

    feature.cleanup?.();
    this._features = this._features.filter((f) => f.name !== name);
    if (this._features.length === 0) {
      this._launcherVisible = false;
    }
    this.notify();
  }

  hasFeatures(): boolean {
    return this._features.length > 0;
  }

  // --- Panel ---

  get panelOpen(): boolean {
    return this._panelOpen;
  }

  openPanel(): void {
    if (!this._enabled || this._panelOpen) return;
    this._panelOpen = true;
    this.notify();
  }

  closePanel(): void {
    if (!this._panelOpen) return;
    this._panelOpen = false;
    this.notify();
  }

  togglePanel(): void {
    if (this._panelOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  // --- Launcher ---

  get launcherVisible(): boolean {
    return this._launcherVisible;
  }

  showLauncher(): void {
    if (!this._enabled) return;
    this._launcherVisible = true;
    this.notify();
  }

  hideLauncher(): void {
    if (!this._launcherVisible) return;
    this._launcherVisible = false;
    this.notify();
  }

  // --- Bulk Operations ---

  clearAll(): void {
    this._features.forEach((f) => f.clear?.());
    this.notify();
  }

  reset(): void {
    this._launcherVisible = false;
    this._panelOpen = false;
    this._features.forEach((f) => f.cleanup?.());
    this._features = [];
    this.notify();
  }

  destroy(): void {
    this.reset();
    this._listeners.clear();
  }
}

/** Module-level default instance for non-React scenarios and backward compatibility. */
export const debugToolkit = new DebugToolkitCore();

export type DebugToolkit = DebugToolkitCore;

/**
 * @deprecated Use `debugToolkit` or get instance from `initializeDebugToolkit()`.
 * This is the default module-level instance exported for backward compatibility.
 */
export const DebugToolkit = debugToolkit;
