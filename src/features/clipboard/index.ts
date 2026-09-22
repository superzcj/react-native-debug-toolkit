import { ClipboardTab } from './ClipboardTab';
import type { DebugFeature } from '../../types';
import type { FeatureConfig } from '../../types/feature';
import type { CopyAction } from '../../types/debug';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';
import { copyToComputer } from '../../utils/copyToComputer';

/**
 * Clipboard feature — all logic lives in ClipboardTab.
 * Data flow is user-driven (TextInput), not event-based.
 */
export interface ClipboardSnapshot { copy: CopyAction }
export const createClipboardFeature = (config: FeatureConfig<{}> = {}, copy?: CopyAction): DebugFeature<ClipboardSnapshot> & FeatureDriver => {
  let context: FeatureContext | undefined;
  const dispose = () => { context?.signal.removeEventListener('abort', dispose); context = undefined; };
  const snapshot: ClipboardSnapshot = { copy: (text, options) =>
    context && context.isCurrent() && !context.signal.aborted && config.enabled !== false && copy
      ? copy(text, options)
      : copyToComputer(text, { ...options, enabled: false, channels: {} }),
  };
  return {
    name: 'clipboard', label: 'Clipboard', renderContent: ClipboardTab,
    setup() {}, getSnapshot: () => snapshot, cleanup: dispose, dispose,
    start(next) {
      if (context || next.signal.aborted || !next.isCurrent() || config.enabled === false) { return; }
      context = next;
      next.signal.addEventListener('abort', dispose, { once: true });
      next.setStatus({ phase: 'ready', issues: [] });
    },
  };
};
