'use strict';

const fs = require('fs');
const path = require('path');
const { SEGMENT_MAX_BYTES, SEGMENT_MAX_AGE_MS } = require('../protocol/constants');
const { fsyncDir } = require('./identityRegistry');

class SegmentWriter {
  constructor(sessionDir, sessionId) {
    this._dir = sessionDir;
    this._sessionId = sessionId;
    this._segmentIndex = 0;
    this._currentFd = null;
    this._currentPath = null;
    this._currentBytes = 0;
    this._currentStartTime = null;
    this._eventCount = 0;
    this._firstReceivedAt = null;
    this._lastReceivedAt = null;
    this._firstSequence = null;
    this._lastSequence = null;
  }

  initialize() {
    fs.mkdirSync(this._dir, { recursive: true });
    
    const files = fs.readdirSync(this._dir)
      .filter(f => new RegExp(`^${this._sessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.(active|jsonl)$`).test(f))
      .sort();
    
    let maxIndex = 0;
    for (const file of files) {
      const match = file.match(/\.(\d+)\.(active|jsonl)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (idx > maxIndex) maxIndex = idx;
      }
    }
    
    const activeFile = files.find(f => f.endsWith('.active'));
    if (activeFile) {
      const activePath = path.join(this._dir, activeFile);
      this._recoverActiveSegment(activePath);
      const match = activeFile.match(/\.(\d+)\.active$/);
      if (match) {
        this._segmentIndex = parseInt(match[1], 10);
      }
    } else {
      this._segmentIndex = maxIndex;
    }
  }

  _recoverActiveSegment(activePath) {
    try {
      let content = fs.readFileSync(activePath, 'utf8');
      const lastNewline = content.lastIndexOf('\n');
      if (lastNewline !== content.length - 1) {
        content = lastNewline >= 0 ? content.slice(0, lastNewline + 1) : '';
        fs.writeFileSync(activePath, content);
      }
      this._currentPath = activePath;
      this._currentBytes = Buffer.byteLength(content, 'utf8');
      this._currentStartTime = Date.now();
      
      const lines = content.split('\n').filter(l => l.trim());
      this._eventCount = lines.length;
      if (lines.length > 0) {
        try {
          const first = JSON.parse(lines[0]);
          this._firstReceivedAt = first.receivedAt;
          this._firstSequence = first.sequence;
          const last = JSON.parse(lines[lines.length - 1]);
          this._lastReceivedAt = last.receivedAt;
          this._lastSequence = last.sequence;
        } catch {}
      }
    } catch {
      // Can't recover - will create new segment
    }
  }

  _segmentFileName(index, ext) {
    return `${this._sessionId}.${String(index).padStart(6, '0')}.${ext}`;
  }

  _openNewSegment() {
    this._segmentIndex += 1;
    const fileName = this._segmentFileName(this._segmentIndex, 'active');
    this._currentPath = path.join(this._dir, fileName);
    this._currentFd = fs.openSync(this._currentPath, 'a');
    this._currentBytes = 0;
    this._currentStartTime = Date.now();
    this._eventCount = 0;
    this._firstReceivedAt = null;
    this._lastReceivedAt = null;
    this._firstSequence = null;
    this._lastSequence = null;
  }

  _closeCurrentSegment() {
    if (this._currentFd !== null) {
      try { fs.fsyncSync(this._currentFd); } catch {}
      try { fs.closeSync(this._currentFd); } catch {}
      this._currentFd = null;
    }
  }

  _rotateSegment() {
    this._closeCurrentSegment();
    if (this._currentPath && this._currentPath.endsWith('.active')) {
      const closedPath = this._currentPath.replace(/\.active$/, '.jsonl');
      fs.renameSync(this._currentPath, closedPath);
      fsyncDir(this._dir);
    }
    this._currentPath = null;
    this._currentBytes = 0;
  }

  _needsRotation(additionalBytes) {
    if (!this._currentPath) return true;
    if (this._currentBytes + additionalBytes > SEGMENT_MAX_BYTES) return true;
    if (this._currentStartTime && (Date.now() - this._currentStartTime) > SEGMENT_MAX_AGE_MS) return true;
    return false;
  }

  appendEvents(envelopes) {
    const results = [];
    const affectedPaths = new Set();
    
    for (const envelope of envelopes) {
      const line = JSON.stringify(envelope) + '\n';
      const lineBytes = Buffer.byteLength(line, 'utf8');
      
      if (this._needsRotation(lineBytes)) {
        if (this._currentPath) this._rotateSegment();
        this._openNewSegment();
      }
      
      if (this._currentFd === null) {
        this._currentFd = fs.openSync(this._currentPath, 'a');
      }
      
      const offset = this._currentBytes;
      fs.writeSync(this._currentFd, line);
      this._currentBytes += lineBytes;
      this._eventCount += 1;
      
      if (!this._firstReceivedAt) this._firstReceivedAt = envelope.receivedAt;
      this._lastReceivedAt = envelope.receivedAt;
      if (this._firstSequence === null) this._firstSequence = envelope.sequence;
      this._lastSequence = envelope.sequence;
      
      affectedPaths.add(this._currentPath);
      results.push({ path: this._currentPath, offset, bytes: lineBytes, sequence: envelope.sequence });
    }
    
    if (this._currentFd !== null) {
      fs.fsyncSync(this._currentFd);
    }
    
    fsyncDir(this._dir);
    
    return results;
  }

  getCurrentSegmentInfo() {
    return {
      path: this._currentPath,
      bytes: this._currentBytes,
      eventCount: this._eventCount,
      firstReceivedAt: this._firstReceivedAt,
      lastReceivedAt: this._lastReceivedAt,
      firstSequence: this._firstSequence,
      lastSequence: this._lastSequence,
      segmentIndex: this._segmentIndex,
    };
  }

  listSegments() {
    try {
      return fs.readdirSync(this._dir)
        .filter(f => new RegExp(`^${this._sessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+\\.(active|jsonl)$`).test(f))
        .sort()
        .map(f => {
          const filePath = path.join(this._dir, f);
          const stat = fs.statSync(filePath);
          return {
            path: filePath,
            name: f,
            bytes: stat.size,
            closed: f.endsWith('.jsonl'),
          };
        });
    } catch {
      return [];
    }
  }

  readSegmentEvents(segmentPath, fromSequence, toSequence) {
    try {
      const content = fs.readFileSync(segmentPath, 'utf8');
      const lines = content.split('\n').filter(l => l.trim());
      const events = [];
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (fromSequence !== undefined && event.sequence < fromSequence) continue;
          if (toSequence !== undefined && event.sequence > toSequence) continue;
          events.push(event);
        } catch {}
      }
      return events;
    } catch {
      return [];
    }
  }

  /** Drop complete-but-uncommitted tail records after an interrupted write. */
  recoverToSequence(ackThrough) {
    this._closeCurrentSegment();
    for (const segment of this.listSegments()) {
      const content = fs.readFileSync(segment.path, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const kept = [];
      let changed = false;
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (typeof event.sequence === 'number' && event.sequence > ackThrough) {
            changed = true;
            continue;
          }
          kept.push(line);
        } catch {
          changed = true;
        }
      }
      if (!changed) continue;
      if (kept.length === 0) {
        fs.unlinkSync(segment.path);
        continue;
      }
      const tmp = `${segment.path}.recover.tmp`;
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeSync(fd, `${kept.join('\n')}\n`);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, segment.path);
    }
    fsyncDir(this._dir);
    this._currentPath = null;
    this._currentFd = null;
    this._currentBytes = 0;
    this._eventCount = 0;
    this._firstReceivedAt = null;
    this._lastReceivedAt = null;
    this._firstSequence = null;
    this._lastSequence = null;
    this.initialize();
  }

  close() {
    this._closeCurrentSegment();
  }
}

module.exports = { SegmentWriter };
