'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateHubRef } = require('../protocol/hubRef');

class Mutex {
  constructor() { this._queue = []; this._locked = false; }
  async acquire() {
    if (!this._locked) { this._locked = true; return; }
    await new Promise(resolve => this._queue.push(resolve));
  }
  release() {
    if (this._queue.length > 0) { this._queue.shift()(); }
    else { this._locked = false; }
  }
}

function fsyncFile(fd) { fs.fsyncSync(fd); }
function fsyncDir(dirPath) {
  let fd;
  try { fd = fs.openSync(dirPath, 'r'); fsyncFile(fd); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, content);
    fsyncFile(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
  fsyncDir(dir);
}

class IdentityRegistry {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._registryPath = path.join(dataDir, 'identity-registry.json');
    this._cursorKeyPath = path.join(dataDir, 'cursor.key');
    this._mutex = new Mutex();
    this._data = null;
    this._cursorKey = null;
  }

  async initialize() {
    await this._mutex.acquire();
    try {
      fs.mkdirSync(this._dataDir, { recursive: true });
      this._loadOrCreate();
      this._loadOrCreateCursorKey();
    } finally {
      this._mutex.release();
    }
  }

  _loadOrCreate() {
    try {
      const raw = fs.readFileSync(this._registryPath, 'utf8');
      this._data = JSON.parse(raw);
    } catch {
      this._data = {
        hubInstanceId: crypto.randomBytes(16).toString('hex'),
        hubRef: generateHubRef(),
        createdAt: new Date().toISOString(),
        appBindings: {},
        sessionTombstones: {},
      };
      atomicWriteJson(this._registryPath, this._data);
    }
  }

  _loadOrCreateCursorKey() {
    try {
      this._cursorKey = fs.readFileSync(this._cursorKeyPath);
      if (this._cursorKey.length !== 32) throw new Error('Invalid cursor key length');
    } catch {
      if (this._cursorKey && this._cursorKey.length > 0) {
        throw new Error('cursor.key is invalid but data directory is not empty');
      }
      this._cursorKey = crypto.randomBytes(32);
      const fd = fs.openSync(this._cursorKeyPath, 'w', 0o600);
      try {
        fs.writeSync(fd, this._cursorKey);
        fsyncFile(fd);
      } finally {
        fs.closeSync(fd);
      }
      fsyncDir(this._dataDir);
    }
  }

  getHubInstanceId() { return this._data?.hubInstanceId || null; }
  getHubRef() { return this._data?.hubRef || null; }
  getCursorKey() { return this._cursorKey; }

  async checkAppBinding(appId, platform, nativeApplicationId) {
    await this._mutex.acquire();
    try {
      const key = `${appId}:${platform}`;
      const binding = this._data.appBindings[key];
      if (!binding) {
        this._data.appBindings[key] = {
          appId,
          platform,
          nativeApplicationId,
          bindingEpoch: 1,
          createdAt: new Date().toISOString(),
          archived: [],
        };
        atomicWriteJson(this._registryPath, this._data);
        return { ok: true, bindingEpoch: 1 };
      }

      if (binding.nativeApplicationId !== nativeApplicationId) {
        return {
          ok: false,
          code: 'APP_ID_CONFLICT',
          expected: binding.nativeApplicationId,
          actual: nativeApplicationId,
        };
      }

      return { ok: true, bindingEpoch: binding.bindingEpoch };
    } finally {
      this._mutex.release();
    }
  }

  async rebindApp(appId, platform, newNativeApplicationId, operatorUid, reason) {
    await this._mutex.acquire();
    try {
      const key = `${appId}:${platform}`;
      const binding = this._data.appBindings[key];
      if (!binding) {
        return { ok: false, code: 'NO_BINDING' };
      }
      const oldEpoch = binding.bindingEpoch;
      binding.archived.push({
        nativeApplicationId: binding.nativeApplicationId,
        bindingEpoch: oldEpoch,
        archivedAt: new Date().toISOString(),
        operatorUid,
        reason,
      });
      binding.nativeApplicationId = newNativeApplicationId;
      binding.bindingEpoch = oldEpoch + 1;
      atomicWriteJson(this._registryPath, this._data);
      return { ok: true, bindingEpoch: binding.bindingEpoch, previousEpoch: oldEpoch };
    } finally {
      this._mutex.release();
    }
  }

  async addSessionTombstone(sessionId, appId, ackThrough) {
    await this._mutex.acquire();
    try {
      const now = new Date();
      this._data.sessionTombstones[sessionId] = {
        appId,
        sessionId,
        ackThrough,
        state: 'preparing',
        requestedAt: now.toISOString(),
        finalizedAt: null,
        expiresAt: null,
      };
      atomicWriteJson(this._registryPath, this._data);
    } finally {
      this._mutex.release();
    }
  }

  async finalizeSessionTombstone(sessionId) {
    await this._mutex.acquire();
    try {
      const tomb = this._data.sessionTombstones[sessionId];
      if (!tomb) return;
      const now = new Date();
      tomb.state = 'active';
      tomb.finalizedAt = now.toISOString();
      tomb.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      atomicWriteJson(this._registryPath, this._data);
    } finally {
      this._mutex.release();
    }
  }

  getSessionTombstone(sessionId) {
    return this._data?.sessionTombstones?.[sessionId] || null;
  }

  isSessionTombstoned(sessionId) {
    const tomb = this.getSessionTombstone(sessionId);
    if (!tomb) return false;
    if (tomb.state === 'preparing') return true;
    if (tomb.state === 'active') {
      if (tomb.expiresAt && new Date(tomb.expiresAt) < new Date()) {
        return false;
      }
      return true;
    }
    return false;
  }

  async cleanExpiredTombstones() {
    await this._mutex.acquire();
    try {
      const now = new Date();
      let changed = false;
      for (const [id, tomb] of Object.entries(this._data.sessionTombstones)) {
        if (tomb.state === 'active' && tomb.expiresAt && new Date(tomb.expiresAt) < now) {
          delete this._data.sessionTombstones[id];
          changed = true;
        }
      }
      if (changed) atomicWriteJson(this._registryPath, this._data);
    } finally {
      this._mutex.release();
    }
  }

  getAppBindings() {
    return { ...this._data?.appBindings };
  }

  getData() { return this._data; }
}

module.exports = { IdentityRegistry, atomicWriteJson, fsyncDir, Mutex };
