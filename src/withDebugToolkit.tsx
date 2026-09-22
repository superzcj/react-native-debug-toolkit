import React, { forwardRef, useLayoutEffect, useState } from 'react';
import type { DebugAccount, DebugToolkitConfig } from './types/config';
import { createToolkitHost, type ToolkitHost } from './core/DebugToolkit';
import { claimHost } from './core/host';
import { DebugToolkitProvider } from './core/DebugToolkitProvider';

const reportError = console.error.bind(console);

// Match the root's render/constructor contract rather than React's static
// contextType fields, which differ between consumers using React 18 and 19.
type RootComponent<P> = ((props: P) => unknown) | (new (props: P) => { render(): unknown });

export function withDebugToolkit<
  P extends object, A extends DebugAccount = DebugAccount,
  S extends readonly unknown[] = readonly never[], I extends { render(): unknown } = { render(): unknown },
>(
  App: new (props: P) => I, config?: DebugToolkitConfig<A, S>,
): React.ForwardRefExoticComponent<React.PropsWithoutRef<P> & React.RefAttributes<I>>;
export function withDebugToolkit<P extends object, A extends DebugAccount = DebugAccount, S extends readonly unknown[] = readonly never[]>(
  App: RootComponent<P>, config?: DebugToolkitConfig<A, S>,
): React.ForwardRefExoticComponent<P>;
export function withDebugToolkit<P extends object, A extends DebugAccount = DebugAccount, S extends readonly unknown[] = readonly never[]>(
  App: RootComponent<P> & { displayName?: string }, config?: DebugToolkitConfig<A, S>,
) {
  const Wrapped = forwardRef<unknown, P>((props, ref) => {
    const [host, setHost] = useState<ToolkitHost | null>(null);
    useLayoutEffect(() => {
      const next = createToolkitHost(config);
      let lease: { release(): void };
      try { lease = claimHost(Symbol('withDebugToolkit'), next); }
      catch {
        next.dispose();
        reportError('[DebugToolkit] duplicate_host: Mount only one withDebugToolkit root.');
        return;
      }
      next.start();
      setHost(next);
      return () => { next.dispose(); lease.release(); };
    }, []);
    const appProps = (ref == null ? props : { ...props, ref }) as P;
    return <DebugToolkitProvider host={host}>{React.createElement(App as React.ComponentType<P>, appProps)}</DebugToolkitProvider>;
  });
  Wrapped.displayName = `withDebugToolkit(${App.displayName || App.name || 'App'})`;
  return Wrapped;
}
