'use strict';

const fs = require('fs');
const path = require('path');
const { Mutex, atomicWriteJson } = require('./fsUtils');
const { generateDeviceId } = require('../protocol/deviceId');
const { createEventEnvelope, createControlRecord } = require('../protocol/envelope');
const { STALE_TIMEOUT_MS } = require('../protocol/constants');

class SessionStore {
  constructor(sessionDir, appId, sessionId) {
    this._dir = sessionDir;
    this._appId = appId;
    this._sessionId = sessionId;
    this._manifestPath = path.join(sessionDir, 'manifest.json');
    this._eventsPath = path.join(sessionDir, 'events.jsonl');
    this._mutex = new Mutex();
    this._manifest = null;
    this._ackThrough = 0;
    this._device = null;
    this._deviceId = null;
    this._lastSeenAt = null;
    this._startedAt = null;
    this._syncState = 'live';
    this._sourceIp = null;
    this._truncated = false;
    this._events = [];
    this._listeners = new Set();
  }

  initialize() {
    fs.mkdirSync(this._dir, { recursive: true });
    this._loadManifest();
    this._loadEvents();
  }

  _loadManifest() {
    try {
      const raw = fs.readFileSync(this._manifestPath, 'utf8');
      this._manifest = JSON.parse(raw);
      this._ackThrough = Number(this._manifest.ackThrough) || 0;
      this._device = this._manifest.device || null;
      this._deviceId = this._manifest.deviceId || null;
      this._lastSeenAt = this._manifest.lastSeenAt || this._manifest.lastActiveAt || null;
      this._startedAt = this._manifest.startedAt || null;
      this._syncState = this._manifest.syncState || 'live';
      this._sourceIp = this._manifest.sourceIp || null;
      this._truncated = !!this._manifest.truncated;
    } catch {
      this._manifest = null;
      this._ackThrough = 0;
    }
  }

  _loadEvents() {
    this._events = [];
    try {
      const raw = fs.readFileSync(this._eventsPath, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          this._events.push(JSON.parse(line));
        } catch {
          // skip corrupt line
        }
      }
    } catch {
      this._events = [];
    }

    // Truncate any uncommitted tail past ackThrough (crash safety).
    if (this._ackThrough > 0) {
      const kept = this._events.filter(e => e.sequence <= this._ackThrough);
      if (kept.length !== this._events.length) {
        this._events = kept;
        this._rewriteEventsFile();
      }
    } else if (this._events.length > 0 && this._ackThrough === 0) {
      this._events = [];
      this._rewriteEventsFile();
    }
  }

  _rewriteEventsFile() {
    const fd = fs.openSync(this._eventsPath, 'w');
    try {
      for (const event of this._events) {
        fs.writeSync(fd, JSON.stringify(event) + '\n');
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  _saveManifest() {
    this._manifest = {
      sessionId: this._sessionId,
      appId: this._appId,
      deviceId: this._deviceId,
      device: this._device,
      ackThrough: this._ackThrough,
      lastSeenAt: this._lastSeenAt,
      lastActiveAt: this._lastSeenAt,
      startedAt: this._startedAt,
      syncState: this._syncState,
      sourceIp: this._sourceIp,
      truncated: this._truncated,
      updatedAt: new Date().toISOString(),
    };
    atomicWriteJson(this._manifestPath, this._manifest);
  }

  async open(params, sourceIp) {
    await this._mutex.acquire();
    try {
      if (this._manifest) {
        if (this._manifest.appId !== this._appId) {
          return { ok: false, code: 'SESSION_METADATA_CONFLICT' };
        }
        if (JSON.stringify(this._device || {}) !== JSON.stringify(params.device || {})) {
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

      const isResume = !!this._manifest;
      this._device = params.device;
      this._deviceId = deviceId;
      this._lastSeenAt = new Date().toISOString();
      this._syncState = 'live';
      this._sourceIp = sourceIp;
      if (!this._startedAt) {
        this._startedAt = params.startedAt
          ? new Date(params.startedAt).toISOString()
          : this._lastSeenAt;
      }

      this._saveManifest();

      return {
        ok: true,
        isResume,
        sessionId: this._sessionId,
        deviceId,
        ackThrough: this._ackThrough,
        expectedSequence: this._ackThrough + 1,
        rejected: [],
      };
    } finally {
      this._mutex.release();
    }
  }

  async appendEvents(firstSequence, wireEvents) {
    await this._mutex.acquire();
    try {
      const expectedSeq = this._ackThrough + 1;
      let startIdx = 0;

      if (firstSequence <= this._ackThrough) {
        const skipCount = this._ackThrough - firstSequence + 1;
        if (skipCount >= wireEvents.length) {
          return {
            ok: true,
            ackThrough: this._ackThrough,
            expectedSequence: expectedSeq,
            rejected: [],
          };
        }
        startIdx = skipCount;
        if (wireEvents[startIdx].sequence !== expectedSeq) {
          return {
            ok: false,
            code: 'INVALID_ARGUMENT',
            message: 'Non-contiguous sequence after duplicate prefix',
          };
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
          ackThrough: this._ackThrough,
          expectedSequence: expectedSeq,
          rejected: [],
        };
      }

      for (let i = 0; i < newEvents.length; i++) {
        const expected = expectedSeq + i;
        if (newEvents[i].sequence !== expected) {
          return {
            ok: false,
            code: 'INVALID_ARGUMENT',
            message: `Non-contiguous sequence: expected ${expected}, got ${newEvents[i].sequence}`,
          };
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
            const control = createControlRecord('event_rejected', sessionMeta, {
              sequence: wireEvent.sequence,
              reason: 'ENVELOPE_TOO_LARGE',
              originalType: wireEvent.type,
            });
            envelopes.push(control);
            rejected.push({ sequence: wireEvent.sequence, reason: 'ENVELOPE_TOO_LARGE' });
          } else {
            envelopes.push(envelope);
          }
        } catch (e) {
          const control = createControlRecord('event_rejected', sessionMeta, {
            sequence: wireEvent.sequence,
            reason: 'VALIDATION_ERROR',
            message: e.message,
          });
          envelopes.push(control);
          rejected.push({
            sequence: wireEvent.sequence,
            reason: 'VALIDATION_ERROR',
            message: e.message,
          });
        }
      }

      const fd = fs.openSync(this._eventsPath, 'a');
      try {
        for (const envelope of envelopes) {
          fs.writeSync(fd, JSON.stringify(envelope) + '\n');
          this._events.push(envelope);
        }
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      this._ackThrough = expectedSeq + newEvents.length - 1;
      this._lastSeenAt = new Date().toISOString();
      this._saveManifest();

      for (const listener of this._listeners) {
        try { listener(envelopes); } catch { /* ignore */ }
      }

      return {
        ok: true,
        ackThrough: this._ackThrough,
        expectedSequence: this._ackThrough + 1,
        rejected,
      };
    } finally {
      this._mutex.release();
    }
  }

  async heartbeat(syncState) {
    await this._mutex.acquire();
    try {
      this._lastSeenAt = new Date().toISOString();
      this._syncState = syncState || 'live';
      this._saveManifest();
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
      ackThrough: this._ackThrough,
      lastSeenAt: this._lastSeenAt,
      startedAt: this._startedAt,
      connectionState: this.getConnectionState(),
      syncState: this._syncState,
      sourceIp: this._sourceIp,
      truncated: this._truncated,
    };
  }

  queryEvents(options) {
    const {
      since,
      until,
      type,
      severity,
      text,
      cursor: fromSequence,
      limit,
      timeBasis = 'received',
    } = options || {};
    const maxLimit = Math.min(limit || 200, 200);
    let allEvents = this._events.slice();

    if (timeBasis === 'event') {
      const { parseIsoInstant } = require('../protocol/time');
      const { eventTimeMs } = require('./contextSelector');
      const sinceMs = since ? parseIsoInstant(since) : null;
      const untilMs = until ? parseIsoInstant(until) : null;
      allEvents = allEvents.filter((event) => {
        const time = eventTimeMs(event, 'event');
        if (!Number.isFinite(time)) {
          return false;
        }
        if (sinceMs != null && time < sinceMs) {
          return false;
        }
        if (untilMs != null && time > untilMs) {
          return false;
        }
        return true;
      });
    } else {
      if (since) allEvents = allEvents.filter(e => e.receivedAt >= since);
      if (until) allEvents = allEvents.filter(e => e.receivedAt <= until);
    }
    if (type) allEvents = allEvents.filter(e => e.type === type);
    if (severity) allEvents = allEvents.filter(e => e.severity === severity);
    if (text) {
      const lower = text.toLowerCase();
      allEvents = allEvents.filter(e => JSON.stringify(e.data).toLowerCase().includes(lower));
    }
    if (fromSequence !== undefined && fromSequence !== null) {
      allEvents = allEvents.filter(e => e.sequence > fromSequence);
    }

    allEvents.sort((a, b) => a.sequence - b.sequence);
    const selected = allEvents.slice(0, maxLimit);
    return {
      events: selected,
      hasMore: allEvents.length > maxLimit,
      nextSequence: selected.length > 0 ? selected[selected.length - 1].sequence : fromSequence,
      total: allEvents.length,
    };
  }

  getEventWindowSummary({
    sinceMs = -Infinity,
    untilMs = Infinity,
    timeBasis = 'event',
    throughSequence = this._ackThrough,
  } = {}) {
    const { isValidTimestampMs, parseIsoInstant, toIsoInstant } = require('../protocol/time');
    const { eventMatchesWindow } = require('./contextSelector');

    let matchedEventCount = 0;
    let minEvent = Infinity;
    let maxEvent = -Infinity;
    let minReceived = Infinity;
    let maxReceived = -Infinity;
    let nearestTimestamp = null;
    let nearestDistance = Infinity;
    let hasRetained = false;

    for (const event of this._events) {
      if (event.sequence > throughSequence) {
        continue;
      }
      hasRetained = true;

      if (isValidTimestampMs(event.timestamp)) {
        minEvent = Math.min(minEvent, event.timestamp);
        maxEvent = Math.max(maxEvent, event.timestamp);
        let distance = 0;
        if (Number.isFinite(sinceMs) && event.timestamp < sinceMs) {
          distance = sinceMs - event.timestamp;
        } else if (Number.isFinite(untilMs) && event.timestamp > untilMs) {
          distance = event.timestamp - untilMs;
        }
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestTimestamp = event.timestamp;
        }
      }

      const receivedMs = parseIsoInstant(event.receivedAt);
      if (receivedMs != null) {
        minReceived = Math.min(minReceived, receivedMs);
        maxReceived = Math.max(maxReceived, receivedMs);
      }

      if (eventMatchesWindow(event, { sinceMs, untilMs, timeBasis, throughSequence })) {
        matchedEventCount += 1;
      }
    }

    const toRange = (min, max) => {
      if (!hasRetained || !Number.isFinite(min) || !Number.isFinite(max)) {
        return null;
      }
      const since = toIsoInstant(min);
      const until = toIsoInstant(max);
      return since && until ? { since, until } : null;
    };

    return {
      matchedEventCount,
      eventTimeRange: toRange(minEvent, maxEvent),
      receivedTimeRange: toRange(minReceived, maxReceived),
      nearestEventTimestamp: nearestTimestamp == null ? null : toIsoInstant(nearestTimestamp),
    };
  }

  selectContext(options = {}) {
    const { selectContextFromEvents } = require('./contextSelector');
    return selectContextFromEvents(this._events, {
      ...options,
      session: this.getSessionInfo(),
    });
  }

  getEvent(sequence) {
    return this._events.find(e => e.sequence === sequence) || null;
  }

  addListener(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  getTotalBytes() {
    let total = 0;
    try { total += fs.statSync(this._eventsPath).size; } catch { /* missing */ }
    try { total += fs.statSync(this._manifestPath).size; } catch { /* missing */ }
    return total;
  }

  close() {
    this._listeners.clear();
  }

  purge() {
    this.close();
    for (const filePath of [this._manifestPath, this._eventsPath]) {
      try { fs.unlinkSync(filePath); } catch { /* missing */ }
    }
    try { fs.rmdirSync(this._dir); } catch { /* not empty / missing */ }
  }
}

module.exports = { SessionStore };
