'use strict';

const fs = require('fs');
const path = require('path');
const { IdentityRegistry } = require('./identityRegistry');
const { SessionStore } = require('./sessionStore');
const { createCursorSigner } = require('../protocol/cursor');
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
    this._registry = new IdentityRegistry(dataDir);
    this._sessions = new Map();
    this._cursorSigner = null;
    this._cleanupTimer = null;
    this._initialized = false;
    this._advertiseUrl = null;
  }

  async initialize() {
    await this._registry.initialize();
    this._cursorSigner = createCursorSigner(this._registry.getCursorKey());
    
    this._loadExistingSessions();
    
    this._cleanupTimer = setInterval(() => this.runCleanup().catch(() => {}), 60 * 60 * 1000);
    await this.runCleanup();
    
    this._initialized = true;
  }

  _loadExistingSessions() {
    try {
      const appDirs = fs.readdirSync(this._dataDir).filter(d => {
        const full = path.join(this._dataDir, d);
        return fs.statSync(full).isDirectory() && d !== 'runtime' && d !== 'home' && d !== 'logs';
      });
      
      for (const appDir of appDirs) {
        const appPath = path.join(this._dataDir, appDir);
        try {
          const deviceDirs = fs.readdirSync(appPath).filter(d => 
            fs.statSync(path.join(appPath, d)).isDirectory()
          );
          for (const deviceDir of deviceDirs) {
            const devicePath = path.join(appPath, deviceDir);
            const manifests = fs.readdirSync(devicePath).filter(f => f.endsWith('.manifest.json'));
            for (const manifest of manifests) {
              const sessionId = manifest.replace('.manifest.json', '');
              try {
                const raw = fs.readFileSync(path.join(devicePath, manifest), 'utf8');
                const data = JSON.parse(raw);
                const store = new SessionStore(devicePath, data.appId || appDir, sessionId);
                store.initialize();
                this._sessions.set(sessionId, store);
              } catch {}
            }
          }
        } catch {}
      }
    } catch {}
  }

  isReady() { return this._initialized; }

  getRegistry() { return this._registry; }
  getCursorSigner() { return this._cursorSigner; }

  getHubInfo() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      canonicalVersion: CANONICAL_VERSION,
      advertiseUrl: this._advertiseUrl,
    };
  }

  setAdvertiseUrl(advertiseUrl) { this._advertiseUrl = advertiseUrl; }

  async openSession(appId, sessionId, params, sourceIp) {
    if (this._registry.isSessionTombstoned(sessionId)) {
      return { ok: false, code: 'SESSION_EXPIRED' };
    }

    if (params.device?.nativeApplicationId) {
      const binding = await this._registry.checkAppBinding(
        appId, params.device.platform, params.device.nativeApplicationId
      );
      if (!binding.ok) return binding;
      params.bindingEpoch = binding.bindingEpoch;
    }

    let store = this._sessions.get(sessionId);
    if (!store) {
      const appDir = safeAppDir(appId);
      const deviceId = require('../protocol/deviceId').generateDeviceId(
        appId, params.device?.platform, params.device?.manufacturer,
        params.device?.model, sourceIp
      );
      const sessionDir = path.join(this._dataDir, appDir, deviceId);
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
    for (const [id, store] of this._sessions) {
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
    try { total += fs.statSync(path.join(this._dataDir, 'identity-registry.json')).size; } catch {}
    try { total += fs.statSync(path.join(this._dataDir, 'cursor.key')).size; } catch {}
    return total;
  }

  isStorageFull() {
    return this.getStorageUsage() >= MAX_STORAGE_BYTES;
  }

  async runCleanup() {
    const now = Date.now();
    
    this._registry.cleanExpiredTombstones().catch(() => {});
    
    const allSegments = [];
    for (const [sessionId, store] of this._sessions) {
      const info = store.getSessionInfo();
      const segments = store._writer?.listSegments() || [];
      for (const seg of segments) {
        allSegments.push({ sessionId, ...seg, appId: info.appId });
      }
    }
    
    allSegments.sort((a, b) => a.name.localeCompare(b.name));
    
    let usage = this.getStorageUsage();
    for (const seg of allSegments) {
      if (seg.closed) {
        const store = this._sessions.get(seg.sessionId);
        if (store) {
          const events = store._writer?.readSegmentEvents(seg.path, undefined, undefined);
          if (events && events.length > 0) {
            const oldest = new Date(events[0].receivedAt).getTime();
            if (now - oldest > RETENTION_MS || usage > MAX_STORAGE_BYTES) {
              try {
                if (await store.discardClosedSegment(seg.path)) {
                usage -= seg.bytes;
                }
              } catch {}
            }
          }
        }
      }
    }
    
    for (const [sessionId, store] of this._sessions) {
      const info = store.getSessionInfo();
      if (info.connectionState === 'stale' && info.lastSeenAt) {
        const lastSeen = new Date(info.lastSeenAt).getTime();
        if (now - lastSeen > RETENTION_MS) {
          this._sessions.delete(sessionId);
          try {
            await this._registry.addSessionTombstone(sessionId, info.appId, info.ackThrough);
            await this._registry.finalizeSessionTombstone(sessionId);
            store.purge();
          } catch {}
        }
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
