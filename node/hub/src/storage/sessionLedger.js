'use strict';

const fs = require('fs');
const path = require('path');
const { Mutex, atomicWriteJson, fsyncDir } = require('./identityRegistry');

const LEDGER_MAX_BYTES = 1024 * 1024;
const LEDGER_MAX_RECORDS = 10000;

function appendLine(filePath, record) {
  const line = JSON.stringify(record) + '\n';
  const fd = fs.openSync(filePath, 'a');
  try {
    fs.writeSync(fd, line);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function readLedgerLines(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch { return []; }
  
  const lines = raw.split('\n').filter(l => l.trim());
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return records;
}

class SessionLedger {
  constructor(ledgerPath) {
    this._path = ledgerPath;
    this._mutex = new Mutex();
    this._records = [];
    this._byteSize = 0;
  }

  load() {
    this._records = readLedgerLines(this._path);
    try {
      const stat = fs.statSync(this._path);
      this._byteSize = stat.size;
    } catch {
      this._byteSize = 0;
    }
  }

  getRecords() { return this._records; }

  getLastRecord(type) {
    for (let i = this._records.length - 1; i >= 0; i--) {
      if (this._records[i].type === type) return this._records[i];
    }
    return null;
  }

  getSessionOpen() {
    for (let i = this._records.length - 1; i >= 0; i--) {
      const record = this._records[i];
      if (record.type === 'session_open' || record.type === 'checkpoint') return record;
    }
    return null;
  }

  getCurrentGeneration() {
    const gen = this.getLastRecord('generation_change');
    const open = this.getSessionOpen();
    return gen?.generation || open?.generation || null;
  }

  getAckThrough() {
    for (let i = this._records.length - 1; i >= 0; i--) {
      const record = this._records[i];
      if (record.type === 'batch_commit' || record.type === 'checkpoint') {
        return record.ackThrough ?? 0;
      }
    }
    return 0;
  }

  getExpectedSequence() {
    return this.getAckThrough() + 1;
  }

  async append(record) {
    await this._mutex.acquire();
    try {
      record.ledgerTimestamp = new Date().toISOString();
      appendLine(this._path, record);
      this._records.push(record);
      this._byteSize += Buffer.byteLength(JSON.stringify(record) + '\n');
      
      if (this._byteSize >= LEDGER_MAX_BYTES || this._records.length >= LEDGER_MAX_RECORDS) {
        await this._compact();
      }
    } finally {
      this._mutex.release();
    }
  }

  async _compact() {
    const open = this.getSessionOpen();
    if (!open) return;
    
    const checkpoint = {
      ...open,
      type: 'checkpoint',
      generation: this.getCurrentGeneration(),
      ackThrough: this.getAckThrough(),
      ledgerTimestamp: new Date().toISOString(),
    };

    const rejections = this._records
      .filter(r => r.type === 'rejection')
      .filter(r => !r.acknowledged);
    if (rejections.length > 0) {
      checkpoint.pendingRejections = rejections;
    }

    const segments = this._records
      .filter(r => r.type === 'segment_rotation' || r.type === 'segment_create')
      .slice(-100);
    if (segments.length > 0) {
      checkpoint.segments = segments;
    }

    const gaps = this._records.filter(r => r.type === 'retention_gap');
    if (gaps.length > 0) {
      checkpoint.gaps = gaps;
    }

    const content = JSON.stringify(checkpoint) + '\n';
    const dir = path.dirname(this._path);
    const tmp = `${this._path}.compact.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this._path);
    fsyncDir(dir);

    this._records = [checkpoint];
    this._byteSize = Buffer.byteLength(content);
  }
}

module.exports = { SessionLedger, appendLine, readLedgerLines };
