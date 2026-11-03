'use strict';

const { spawn } = require('node:child_process');
const { disableState } = require('../../../../metro/activation');

function superviseHub(entry, args) {
  const projectRoot = process.cwd();
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, DEBUG_TOOLKIT_HUB_WORKER: '1', DEBUG_TOOLKIT_HUB_OWNER_PID: String(process.pid) },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      if (child.exitCode === null && child.signalCode === null) { child.kill(signal); }
    });
  }
  child.on('error', (error) => {
    clearActivation();
    process.stderr.write(`Failed to start Hub: ${error.message}\n`);
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    clearActivation();
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  function clearActivation() {
    try { disableState(projectRoot, process.pid); }
    catch (error) { process.stderr.write(`Failed to clear Hub activation: ${error.message}\n`); }
  }
}

module.exports = { superviseHub };
