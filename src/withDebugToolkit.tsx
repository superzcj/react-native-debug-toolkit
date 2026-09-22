import React, { forwardRef, useLayoutEffect, useState } from 'react';
import type { DebugAccount, DebugToolkitConfig } from './types/config';
import { createToolkitHost, type ToolkitHost } from './core/DebugToolkit';
import { claimHost } from './core/host';
import { DebugToolkitProvider } from './core/DebugToolkitProvider';

const reportError = console.error.bind(console);

export function withDebugToolkit<P extends object, A extends DebugAccount = DebugAccount, S extends readonly unknown[] = readonly never[]>(
  App: React.ComponentClass<P>, config?: DebugToolkitConfig<A, S>,
): React.ComponentType<P & React.RefAttributes<React.Component<P>>>;
export function withDebugToolkit<P extends object, A extends DebugAccount = DebugAccount, S extends readonly unknown[] = readonly never[]>(
  App: React.ComponentType<P>, config?: DebugToolkitConfig<A, S>,
): React.ComponentType<P>;
export function withDebugToolkit<P extends object, A extends DebugAccount = DebugAccount, S extends readonly unknown[] = readonly never[]>(
  App: React.ComponentType<P>, config?: DebugToolkitConfig<A, S>,
): React.ComponentType<P> {
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
    return <DebugToolkitProvider host={host}>{React.createElement(App, appProps)}</DebugToolkitProvider>;
  });
  Wrapped.displayName = `withDebugToolkit(${App.displayName || App.name || 'App'})`;
  return Wrapped as unknown as React.ComponentType<P>;
}
