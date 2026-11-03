'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OFF = { enabled: false };

function statePath(projectRoot) {
  return path.join(projectRoot, '.debug-toolkit', 'hub-activation.json');
}

function readState(projectRoot) {
  try { return JSON.parse(fs.readFileSync(statePath(projectRoot), 'utf8')); }
  catch { return null; }
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) { return false; }
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function writeState(projectRoot, state) {
  const target = statePath(projectRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`);
  fs.renameSync(temporary, target);
}

function initializeState(projectRoot) {
  const state = readState(projectRoot);
  if (state?.enabled === true && alive(state.ownerPid) && alive(state.hubPid)
    && Number.isInteger(state.port) && state.port > 0 && state.port <= 65535) { return; }
  if (state?.enabled === false && Object.keys(state).length === 1) { return; }
  writeState(projectRoot, OFF);
}

function enableState(projectRoot, ownerPid, hubPid, port) {
  writeState(projectRoot, { enabled: true, ownerPid, hubPid, port });
}

function disableState(projectRoot, ownerPid) {
  if (readState(projectRoot)?.ownerPid === ownerPid) { writeState(projectRoot, OFF); }
}

module.exports = { statePath, readState, initializeState, enableState, disableState };
