'use strict';

const fs = require('fs');
const path = require('path');

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

module.exports = { Mutex, atomicWriteJson, fsyncDir };
