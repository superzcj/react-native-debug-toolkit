import { getActiveRuntime } from './host';
import type { DebugActions } from '../types/debug';
import type { ToolkitHost } from './DebugToolkit';
import { copyToComputer } from '../utils/copyToComputer';

function active(): ToolkitHost | null {
  const runtime = getActiveRuntime();
  return runtime && 'actions' in runtime ? runtime as ToolkitHost : null;
}

/** Public calls only query the mounted owner; importing/calling this never starts it. */
export const debug: DebugActions = {
  ready: () => getActiveRuntime()?.ready ?? Promise.resolve({ status: 'not_started', features: {}, issues: [] }),
  open: () => active()?.actions.open(),
  close: () => active()?.actions.close(),
  clear: feature => active()?.actions.clear(feature),
  track: (name, data) => active()?.actions.track(name, data),
  state: (id, event) => active()?.actions.state(id, event),
  navigation: event => active()?.actions.navigation(event),
  copyToComputer: (text, options) => active()?.actions.copyToComputer(text, options)
    ?? copyToComputer(text, { ...options, enabled: false, channels: {} }),
  environment: {
    switchTo: id => active()?.actions.environment.switchTo(id) ?? Promise.resolve(),
  },
  getReport: () => active()?.actions.getReport() ?? { status: 'not_started', features: {}, logs: {} },
  accounts: {
    switchTo: id => active()?.actions.accounts.switchTo(id) ?? Promise.resolve({ status: 'disabled' }),
    suspend: () => active()?.actions.accounts.suspend(),
    resume: () => active()?.actions.accounts.resume(),
    waitForIdle: () => active()?.actions.accounts.waitForIdle() ?? Promise.resolve(),
  },
};
