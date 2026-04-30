import { useEffect, useRef } from 'react';
import { addNavigationLog } from './index';
import { safeStringify } from '../../utils/safeStringify';
import type { NavigationContainerRef } from '../../types';

function getActiveRouteName(state: unknown): string {
  let currentState = state as
    | {
        index?: number;
        routes?: Array<{ name?: string; state?: unknown }>;
      }
    | undefined;

  while (currentState?.routes && typeof currentState.index === 'number') {
    const route = currentState.routes[currentState.index];
    if (!route) {
      return '';
    }
    if (!route.state) {
      return route.name ?? '';
    }
    currentState = route.state as typeof currentState;
  }

  return '';
}


/**
 * Hook to automatically log React Navigation events.
 *
 * Usage:
 * ```tsx
 * const navigationRef = useRef<NavigationContainerRef>(null);
 * useNavigationLogger(navigationRef);
 * return <NavigationContainer ref={navigationRef}>...</NavigationContainer>;
 * ```
 */
export function useNavigationLogger(navigationRef: React.RefObject<NavigationContainerRef | null>) {
  const previousRouteNameRef = useRef('');

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;

    const attachListener = () => {
      if (disposed) {
        return;
      }

      const ref = navigationRef.current;
      if (!ref || typeof ref.addListener !== 'function') {
        timeoutId = setTimeout(attachListener, 250);
        return;
      }

      const currentRouteName =
        ref.getCurrentRoute?.()?.name ||
        getActiveRouteName(ref.getRootState?.());
      if (currentRouteName) {
        previousRouteNameRef.current = currentRouteName;
      }

      unsubscribe = ref.addListener('state', () => {
        try {
          const navState = ref.getRootState?.();
          const nextRouteName =
            ref.getCurrentRoute?.()?.name ||
            getActiveRouteName(navState);

          if (!nextRouteName || nextRouteName === previousRouteNameRef.current) {
            return;
          }

          addNavigationLog(
            'navigate',
            previousRouteNameRef.current,
            nextRouteName,
            undefined,
            undefined,
            safeStringify(navState),
          );

          previousRouteNameRef.current = nextRouteName;
        } catch {
          // Navigation state may not be ready
        }
      });
    };

    attachListener();

    return () => {
      disposed = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      unsubscribe?.();
    };
  }, [navigationRef]);
}
