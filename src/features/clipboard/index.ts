import { ClipboardTab } from './ClipboardTab';
import type { DebugFeature } from '../../types';

/**
 * Clipboard feature — all logic lives in ClipboardTab.
 * Data flow is user-driven (TextInput), not event-based.
 */
export const createClipboardFeature = (): DebugFeature<null> => ({
  name: 'clipboard',
  label: 'Clipboard',
  renderContent: ClipboardTab,
  setup() {},
  getSnapshot: () => null,
  cleanup() {},
});
