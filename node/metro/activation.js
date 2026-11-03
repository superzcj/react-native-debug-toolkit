'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const OFF = { enabled: false };

function statePath(projectRoot) {
  return path.join(projectRoot, '.debug-toolkit', 'hub-activation.json');
}

function lockPath(projectRoot) {
  return path.join(projectRoot, '.debug-toolkit', 'hub.lock');
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

function claimProject(projectRoot, ownerPid, hubPid) {
  const lock = lockPath(projectRoot);
  const temporary = `${lock}.${process.pid}.${randomUUID()}.tmp`;
  const recovery = `${lock}.recovery`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify({ ownerPid, hubPid }), { flag: 'wx' });
  try {
    try {
      fs.linkSync(temporary, lock);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') { throw error; }
    }

    // Serialize stale-lock recovery, so two starters cannot remove each other's lock.
    try { fs.mkdirSync(recovery); }
    catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`Hub lock recovery is in progress; if interrupted, remove ${recovery}`);
      }
      throw error;
    }
    try {
      let existing;
      try { existing = JSON.parse(fs.readFileSync(lock, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') { throw new Error(`Cannot read Hub lock ${lock}: ${error.message}`); }
      }
      if (existing && (alive(existing.ownerPid) || alive(existing.hubPid))) {
        throw new Error('A Hub is already running for this project');
      }
      if (existing) { fs.unlinkSync(lock); }
      try { fs.linkSync(temporary, lock); }
      catch (error) {
        if (error.code === 'EEXIST') { throw new Error('A Hub is already running for this project'); }
        throw error;
      }
    } finally {
      fs.rmdirSync(recovery);
    }
  } finally {
    fs.unlinkSync(temporary);
  }
}

function enableState(projectRoot, ownerPid, hubPid, port) {
  writeState(projectRoot, { enabled: true, ownerPid, hubPid, port });
}

function disableState(projectRoot, ownerPid) {
  if (readState(projectRoot)?.ownerPid === ownerPid) { writeState(projectRoot, OFF); }
  const lock = lockPath(projectRoot);
  try {
    const holder = JSON.parse(fs.readFileSync(lock, 'utf8'));
    if (holder.ownerPid === ownerPid) { fs.unlinkSync(lock); }
  } catch (error) {
    if (error.code !== 'ENOENT') { throw error; }
  }
}

module.exports = { statePath, readState, initializeState, claimProject, enableState, disableState };
