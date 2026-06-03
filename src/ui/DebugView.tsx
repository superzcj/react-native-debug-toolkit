import React, { useEffect, useRef } from 'react';
import { DebugToolkitProvider } from '../core/DebugToolkitProvider';
import { initializeDebugToolkit } from '../core/initialize';
import type { FeatureConfigs } from '../core/initialize';
import { useNavigationLogger } from '../features/navigation/useNavigationLogger';
import type { AnyDebugFeature, EnvironmentConfig, NavigationContainerRef } from '../types';

// --- Types ---

export interface DebugViewProps {
  children: React.ReactNode;
  /**
   * Enable/disable specific features. Omitted features default to enabled.
   * Set to `false` to disable a feature.
   */
  features?: Partial<FeatureConfigs>;
  /** Custom tabs/features appended after built-in features. */
  customFeatures?: AnyDebugFeature[];
  /** Navigation container ref for route tracking. */
  navigationRef?: React.RefObject<NavigationContainerRef | null>;
  /** Environment configs for runtime host switching. */
  environments?: EnvironmentConfig[];
  /** Force enable/disable (default: `__DEV__`). */
  enabled?: boolean;
}

// --- Inner component for navigation hook (satisfies rules of hooks) ---

function NavigationLoggerInner({
  navigationRef,
}: {
  navigationRef: React.RefObject<NavigationContainerRef | null>;
}) {
  useNavigationLogger(navigationRef);
  return null;
}

// --- Main component ---

export function DebugView({
  children,
  features,
  customFeatures,
  navigationRef,
  environments,
  enabled,
}: DebugViewProps) {
  const destroyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Build feature config: all enabled by default, user overrides take precedence
    const resolvedFeatures: FeatureConfigs = {
      network: true,
      console: true,
      native: true,
      zustand: true,
      navigation: true,
      track: true,
      clipboard: true,
      devConnect: true,
      sessionHistory: true,
      ...features,
    };

    // Apply environments prop
    if (environments) {
      resolvedFeatures.environment = environments;
    }

    // Initialize toolkit
    let cancelled = false;
    initializeDebugToolkit({
      features: resolvedFeatures,
      customFeatures,
      enabled,
    }).then((toolkit) => {
      if (!cancelled) {
        destroyRef.current = () => toolkit.destroy();
      }
    });

    return () => {
      cancelled = true;
      destroyRef.current?.();
      destroyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DebugToolkitProvider>
      {navigationRef && <NavigationLoggerInner navigationRef={navigationRef} />}
      {children}
    </DebugToolkitProvider>
  );
}
