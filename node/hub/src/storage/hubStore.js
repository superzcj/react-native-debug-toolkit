'use strict';

const fs = require('fs');
const path = require('path');
const { SessionStore } = require('./sessionStore');
const {
  RETENTION_MS, MAX_STORAGE_BYTES,
  PROTOCOL_VERSION, CANONICAL_VERSION,
} = require('../protocol/constants');

function safeAppDir(appId) {
  return appId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

class HubStore {
  constructor(dataDir) {
    this._dataDir = dataDir;
    this._sessions = new Map();
    this._cleanupTimer = null;
    this._initialized = false;
    this._advertiseUrl = null;
  }

  async initialize() {
    fs.mkdirSync(this._dataDir, { recursive: true });
    this._loadExistingSessions();
    this._cleanupTimer = setInterval(() => this.runCleanup().catch(() => {}), 60 * 60 * 1000);
    await this.runCleanup();
    this._initialized = true;
  }

  _loadExistingSessions() {
    let appDirs = [];
    try {
      appDirs = fs.readdirSync(this._dataDir).filter(d => {
        const full = path.join(this._dataDir, d);
        return fs.statSync(full).isDirectory();
      });
    } catch {
      return;
    }

    for (const appDir of appDirs) {
      const appPath = path.join(this._dataDir, appDir);
      let sessionDirs = [];
      try {
        sessionDirs = fs.readdirSync(appPath).filter(d =>
          fs.statSync(path.join(appPath, d)).isDirectory()
        );
      } catch {
        continue;
      }

      for (const sessionId of sessionDirs) {
        const sessionPath = path.join(appPath, sessionId);
        const manifestPath = path.join(sessionPath, 'manifest.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const data = JSON.parse(raw);
          const store = new SessionStore(sessionPath, data.appId || appDir, sessionId);
          store.initialize();
          this._sessions.set(sessionId, store);
        } catch {
          // skip broken session
        }
      }
    }
  }

  isReady() { return this._initialized; }

  getHubInfo() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      canonicalVersion: CANONICAL_VERSION,
      advertiseUrl: this._advertiseUrl,
    };
  }

  setAdvertiseUrl(advertiseUrl) { this._advertiseUrl = advertiseUrl; }

  async openSession(appId, sessionId, params, sourceIp) {
    let store = this._sessions.get(sessionId);
    if (!store) {
      const sessionDir = path.join(this._dataDir, safeAppDir(appId), sessionId);
      store = new SessionStore(sessionDir, appId, sessionId);
      store.initialize();
      this._sessions.set(sessionId, store);
    }
    return store.open(params, sourceIp);
  }

  getSession(sessionId) {
    return this._sessions.get(sessionId) || null;
  }

  listAppIds() {
    return [...new Set([...this._sessions.values()].map(store => store.getSessionInfo().appId))]
      .filter(Boolean)
      .sort();
  }

  listSessions(appId, options) {
    const { limit, activeFirst } = options || {};
    const maxLimit = Math.min(limit || 50, 50);

    const sessions = [];
    for (const [, store] of this._sessions) {
      const info = store.getSessionInfo();
      if (appId && info.appId !== appId) continue;
      sessions.push(info);
    }

    sessions.sort((a, b) => {
      if (activeFirst !== false) {
        if (a.connectionState === 'active' && b.connectionState !== 'active') return -1;
        if (b.connectionState === 'active' && a.connectionState !== 'active') return 1;
      }
      return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
    });

    return {
      sessions: sessions.slice(0, maxLimit),
      total: sessions.length,
      omitted: Math.max(0, sessions.length - maxLimit),
    };
  }

  getStorageUsage() {
    let total = 0;
    for (const [, store] of this._sessions) {
      total += store.getTotalBytes();
    }
    return total;
  }

  isStorageFull() {
    return this.getStorageUsage() >= MAX_STORAGE_BYTES;
  }

  async runCleanup() {
    const now = Date.now();
    for (const [sessionId, store] of [...this._sessions.entries()]) {
      const info = store.getSessionInfo();
      const lastSeen = info.lastSeenAt ? new Date(info.lastSeenAt).getTime() : 0;
      if (lastSeen && now - lastSeen > RETENTION_MS) {
        this._sessions.delete(sessionId);
        try { store.purge(); } catch { /* ignore */ }
        // Remove empty app directory if possible
        try {
          const sessionDir = path.join(this._dataDir, safeAppDir(info.appId), sessionId);
          fs.rmSync(path.dirname(sessionDir), { recursive: false, force: false });
        } catch { /* not empty */ }
      }
    }
  }

  close() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    for (const [, store] of this._sessions) {
      store.close();
    }
    this._sessions.clear();
  }
}

module.exports = { HubStore, safeAppDir };
