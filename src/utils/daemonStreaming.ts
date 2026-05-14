import { checkDaemonConnection } from './daemonConnection';
import {
  loadDaemonSettings,
  loadDaemonStreamingEnabled,
  normalizeDaemonSettings,
  saveDaemonStreamingEnabled,
} from './daemonSettings';
import { isStreaming, startStreaming } from './streamToDaemon';

const AUTO_CONNECT_TIMEOUT_MS = 1000;

let restorePromise: Promise<void> | null = null;

function canProbeDaemon(settings: Awaited<ReturnType<typeof loadDaemonSettings>>): boolean {
  return settings.mode === 'simulator' || Boolean(settings.deviceHost.trim());
}

async function restoreDaemonStreamingOnce(): Promise<void> {
  if (isStreaming()) {
    return;
  }

  const settings = await loadDaemonSettings();
  const enabled = await loadDaemonStreamingEnabled();
  const options = normalizeDaemonSettings(settings);

  if (enabled === false) {
    return;
  }

  if (enabled === true) {
    startStreaming(options);
    return;
  }

  if (!canProbeDaemon(settings)) {
    return;
  }

  const connection = await checkDaemonConnection({
    ...options,
    timeoutMs: AUTO_CONNECT_TIMEOUT_MS,
  });

  if (!connection.ok || isStreaming()) {
    return;
  }

  await saveDaemonStreamingEnabled(true);
  startStreaming(options);
}

export function restoreDaemonStreaming(): Promise<void> {
  if (!restorePromise) {
    restorePromise = restoreDaemonStreamingOnce().finally(() => {
      restorePromise = null;
    });
  }
  return restorePromise;
}
