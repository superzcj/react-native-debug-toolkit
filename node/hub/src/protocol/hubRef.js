'use strict';

const crypto = require('crypto');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateHubRef() {
  const bytes = crypto.randomBytes(4);
  let result = '';
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(acc >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += BASE32_CHARS[(acc << (5 - bits)) & 0x1f];
  }
  return result.slice(0, 6);
}

function generateSessionRef(sessionId, length) {
  const len = length || 4;
  const hash = crypto.createHash('sha256').update(sessionId).digest('hex');
  return hash.slice(0, len).toUpperCase();
}

module.exports = {
  generateHubRef,
  generateSessionRef,
};
