'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Mutex, atomicWriteJson, fsyncDir } = require('./identityRegistry');
const { SessionLedger } = require('./sessionLedger');
const { SegmentWriter } = require('./segmentWriter');
const { generateDeviceId } = require('../protocol/deviceId');
const { createEventEnvelope, createControlRecord } = require('../protocol/envelope');
const { STALE_TIMEOUT_MS } = require('../protocol/constants');
const { verifyPayloadHash } = require('../protocol/canonical');

class SessionStore {
  constructor(sessionDir, appId, sessionId) {
    this._dir = sessionDir;
    this._appId = appId;
    this._sessionId = sessionId;
    this._manifestPath = path.join(sessionDir, `${sessionId}.manifest.json`);
    this._ledgerPath = path.join(sessionDir, `${sessionId}.ledger.jsonl`);
    this._mutex = new Mutex();
    this._ledger = new SessionLedger(this._ledgerPath);
    this._writer = new SegmentWriter(sessionDir, sessionId);
    this._manifest = null;
    this._generation = null;
    this._device = null;
    this._deviceId = null;
    this._lastSeenAt = null;
    this._syncState = 'live';
    this._sourceIp = null;
    this._truncated = false;
    this._listeners = new Set();
  }

  initialize() {
    fs.mkdirSync(this._dir, { recursive: true });
    this._ledger.load();
    this._writer.initialize();
    this._writer.recoverToSequence(this._ledger.getAckThrough());
    this._loadManifest();
  }

  _loadManifest() {
    try {
      const raw = fs.readFileSync(this._manifestPath, 'utf8');
      this._manifest = JSON.parse(raw);
      this._generation = this._manifest.generation;
      this._device = this._manifest.device;
      this._deviceId = this._manifest.deviceId;
      this._lastSeenAt = this._manifest.lastSeenAt;
      this._syncState = this._manifest.syncState || 'live';
      this._sourceIp = this._manifest.sourceIp || null;
      this._truncated = this._manifest.truncated || false;
    } catch {
      this._manifest = null;
    }
  }

  _saveManifest() {
    const segInfo = this._writer.getCurrentSegmentInfo();
    const segments = this._writer.listSegments().map(s => ({
      name: s.name,
      bytes: s.bytes,
      closed: s.closed,
    }));
    
    this._manifest = {
      sessionId: this._sessionId,
      appId: this._appId,
      deviceId: this._deviceId,
      device: this._device,
      generation: this._generation,
      ackThrough: this._ledger.getAckThrough(),
      lastSeenAt: this._lastSeenAt,
      syncState: this._syncState,
      sourceIp: this._sourceIp,
      truncated: this._truncated,
      currentSegment: segInfo,
      segments,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(this._manifestPath, this._manifest);
  }

  async open(params, sourceIp) {
    await this._mutex.acquire();
    try {
      const existingOpen = this._ledger.getSessionOpen();
      
      if (existingOpen) {
        if (existingOpen.appId !== this._appId ||
            JSON.stringify(existingOpen.device || {}) !== JSON.stringify(params.device || {})) {
          return { ok: false, code: 'SESSION_METADATA_CONFLICT' };
        }
      }

      const deviceId = generateDeviceId(
        this._appId,
        params.device?.platform,
        params.device?.manufacturer,
        params.device?.model,
        sourceIp,
      );
      this._generation = crypto.randomBytes(32).toString('hex');
      this._device = params.device;
      this._deviceId = deviceId;
      this._lastSeenAt = new Date().toISOString();
      this._syncState = 'live';
      this._sourceIp = sourceIp;

      const record = {
        type: 'session_open',
        sessionId: this._sessionId,
        appId: this._appId,
        deviceId,
        generation: this._generation,
        device: params.device,
        sourceIp,
        startedAt: params.startedAt,
        bindingEpoch: params.bindingEpoch || 1,
      };

      await this._ledger.append(record);

      await this._ledger.append({
        type: 'generation_change',
        generation: this._generation,
        previousGeneration: existingOpen ? this._ledger.getCurrentGeneration() : null,
      });

      this._saveManifest();

      const isResume = !!existingOpen;
      const ackThrough = this._ledger.getAckThrough();

      return {
        ok: true,
        isResume,
        sessionId: this._sessionId,
        deviceId,
        generation: this._generation,
        bindingEpoch: params.bindingEpoch || 1,
        ackThrough,
        expectedSequence: ackThrough + 1,
        rejected: [],
      };
    } finally {
      this._mutex.release();
    }
  }

  async appendEvents(generation, firstSequence, wireEvents) {
    await this._mutex.acquire();
    try {
      if (generation !== this._generation) {
        return { ok: false, code: 'STALE_GENERATION' };
      }

      const expectedSeq = this._ledger.getExpectedSequence();
      const ackThrough = this._ledger.getAckThrough();

      for (const wireEvent of wireEvents) {
        if (!verifyPayloadHash({ ...wireEvent, sessionId: this._sessionId }, wireEvent.payloadHash)) {
          return {
            ok: false,
            code: 'PAYLOAD_HASH_MISMATCH',
            message: `Payload hash mismatch at sequence ${wireEvent.sequence}`,
          };
        }
      }

      let startIdx = 0;
      if (firstSequence <= ackThrough) {
        const skipCount = ackThrough - firstSequence + 1;
        for (const wireEvent of wireEvents.slice(0, Math.min(skipCount, wireEvents.length))) {
          const stored = this.getEvent(wireEvent.sequence);
          if (stored?.payloadHash && stored.payloadHash !== wireEvent.payloadHash) {
            return { ok: false, code: 'SEQUENCE_CONFLICT', message: `Conflicting duplicate at sequence ${wireEvent.sequence}` };
          }
        }
        if (skipCount >= wireEvents.length) {
          return {
            ok: true,
            ackThrough,
            expectedSequence: expectedSeq,
            rejected: [],
          };
        }
        startIdx = skipCount;
        if (wireEvents[startIdx].sequence !== expectedSeq) {
          return { ok: false, code: 'INVALID_ARGUMENT', message: 'Non-contiguous sequence after duplicate prefix' };
        }
      } else if (firstSequence > expectedSeq) {
        return {
          ok: false,
          code: 'INVALID_ARGUMENT',
          message: `Gap detected: expected sequence ${expectedSeq}, got ${firstSequence}`,
          expectedSequence: expectedSeq,
        };
      }

      const newEvents = wireEvents.slice(startIdx);
      if (newEvents.length === 0) {
        return {
          ok: true,
          ackThrough,
          expectedSequence: expectedSeq,
          rejected: [],
        };
      }

      for (let i = 0; i < newEvents.length; i++) {
        const expected = expectedSeq + i;
        if (newEvents[i].sequence !== expected) {
          return { ok: false, code: 'INVALID_ARGUMENT', message: `Non-contiguous sequence: expected ${expected}, got ${newEvents[i].sequence}` };
        }
      }

      const sessionMeta = {
        sessionId: this._sessionId,
        appId: this._appId,
        deviceId: this._deviceId,
      };

      const envelopes = [];
      const rejected = [];
      for (const wireEvent of newEvents) {
        try {
          const envelope = createEventEnvelope(wireEvent, sessionMeta);
          const json = JSON.stringify(envelope);
          if (Buffer.byteLength(json) > 64 * 1024) {
            const tombstone = createControlRecord('event_rejected', sessionMeta, {
              sequence: wireEvent.sequence,
              reason: 'ENVELOPE_TOO_LARGE',
              originalType: wireEvent.type,
              payloadHash: wireEvent.payloadHash,
            });
            envelopes.push(tombstone);
            rejected.push({
              sequence: wireEvent.sequence,
              reason: 'ENVELOPE_TOO_LARGE',
            });
          } else {
            envelopes.push(envelope);
          }
        } catch (e) {
          const tombstone = createControlRecord('event_rejected', sessionMeta, {
            sequence: wireEvent.sequence,
            reason: 'VALIDATION_ERROR',
            message: e.message,
          });
          envelopes.push(tombstone);
          rejected.push({
            sequence: wireEvent.sequence,
            reason: 'VALIDATION_ERROR',
            message: e.message,
          });
        }
      }

      this._writer.appendEvents(envelopes);

      const newAckThrough = expectedSeq + newEvents.length - 1;
      await this._ledger.append({
        type: 'batch_commit',
        ackThrough: newAckThrough,
        eventCount: newEvents.length,
        firstSequence: expectedSeq,
        lastSequence: newAckThrough,
      });

      for (const rej of rejected) {
        await this._ledger.append({
          type: 'rejection',
          sequence: rej.sequence,
          reason: rej.reason,
          acknowledged: false,
        });
      }

      this._lastSeenAt = new Date().toISOString();
      this._saveManifest();

      for (const listener of this._listeners) {
        try { listener(envelopes); } catch {}
      }

      return {
        ok: true,
        ackThrough: newAckThrough,
        expectedSequence: newAckThrough + 1,
        rejected,
      };
    } finally {
      this._mutex.release();
    }
  }

  async heartbeat(generation, syncState, clientAckThrough) {
    await this._mutex.acquire();
    try {
      if (generation !== this._generation) {
        return { ok: false, code: 'STALE_GENERATION' };
      }

      this._lastSeenAt = new Date().toISOString();
      this._syncState = syncState || 'live';

      return {
        ok: true,
        lastSeenAt: this._lastSeenAt,
        connectionState: 'active',
        syncState: this._syncState,
      };
    } finally {
      this._mutex.release();
    }
  }

  getConnectionState() {
    if (!this._lastSeenAt) return 'stale';
    const elapsed = Date.now() - new Date(this._lastSeenAt).getTime();
    return elapsed <= STALE_TIMEOUT_MS ? 'active' : 'stale';
  }

  getSessionInfo() {
    return {
      sessionId: this._sessionId,
      appId: this._appId,
      deviceId: this._deviceId,
      device: this._device,
      generation: this._generation,
      ackThrough: this._ledger.getAckThrough(),
      lastSeenAt: this._lastSeenAt,
      connectionState: this.getConnectionState(),
      syncState: this._syncState,
      sourceIp: this._sourceIp,
      truncated: this._truncated,
    };
  }

  queryEvents(options) {
    const { since, until, type, severity, text, cursor: fromSequence, limit } = options || {};
    const maxLimit = Math.min(limit || 200, 200);
    const segments = this._writer.listSegments();
    let allEvents = [];
    
    for (const seg of segments) {
      const events = this._writer.readSegmentEvents(seg.path);
      allEvents.push(...events);
    }
    
    if (since) allEvents = allEvents.filter(e => e.receivedAt >= since);
    if (until) allEvents = allEvents.filter(e => e.receivedAt <= until);
    if (type) allEvents = allEvents.filter(e => e.type === type);
    if (severity) allEvents = allEvents.filter(e => e.severity === severity);
    if (text) {
      const lower = text.toLowerCase();
      allEvents = allEvents.filter(e => JSON.stringify(e.data).toLowerCase().includes(lower));
    }
    if (fromSequence !== undefined) {
      allEvents = allEvents.filter(e => e.sequence > fromSequence);
    }
    
    allEvents.sort((a, b) => a.sequence - b.sequence);
    
    const selected = allEvents.slice(0, maxLimit);
    const hasMore = allEvents.length > maxLimit;
    const nextSequence = selected.length > 0 ? selected[selected.length - 1].sequence : fromSequence;
    
    return {
      events: selected,
      hasMore,
      nextSequence,
      total: allEvents.length,
    };
  }

  getEvent(sequence) {
    const segments = this._writer.listSegments();
    for (const seg of segments) {
      const events = this._writer.readSegmentEvents(seg.path, sequence, sequence);
      if (events.length > 0) return events[0];
    }
    return null;
  }

  addListener(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  getTotalBytes() {
    const segments = this._writer.listSegments();
    let total = 0;
    for (const seg of segments) total += seg.bytes;
    try { total += fs.statSync(this._ledgerPath).size; } catch {}
    try { total += fs.statSync(this._manifestPath).size; } catch {}
    return total;
  }

  async discardClosedSegment(segmentPath) {
    await this._mutex.acquire();
    try {
      const segment = this._writer.listSegments().find(item => item.path === segmentPath);
      if (!segment || !segment.closed) return false;
      const events = this._writer.readSegmentEvents(segmentPath);
      const sequences = events.map(event => event.sequence).filter(sequence => Number.isSafeInteger(sequence) && sequence > 0);
      if (sequences.length > 0) {
        await this._ledger.append({
          type: 'retention_gap',
          fromSequence: Math.min(...sequences),
          throughSequence: Math.max(...sequences),
        });
      }
      fs.unlinkSync(segmentPath);
      this._truncated = true;
      this._saveManifest();
      return true;
    } finally {
      this._mutex.release();
    }
  }

  close() {
    this._writer.close();
    this._listeners.clear();
  }

  purge() {
    this.close();
    const paths = [this._manifestPath, this._ledgerPath, `${this._ledgerPath}.compact.tmp`];
    for (const segment of this._writer.listSegments()) paths.push(segment.path);
    for (const filePath of paths) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
}

module.exports = { SessionStore };
