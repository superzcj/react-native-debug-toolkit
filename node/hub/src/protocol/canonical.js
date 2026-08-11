'use strict';

const crypto = require('crypto');

const CANONICAL_VERSION = 1;

// Non-JSON value normalization (section 7.3)
function normalizeValue(value, seen, path) {
  if (value === undefined) return { $type: 'undefined' };
  if (value === null) return null;

  if (typeof value === 'function')
    return { $type: 'function', name: value.name || '' };
  if (typeof value === 'symbol')
    return { $type: 'symbol', name: value.description || '' };
  if (typeof value === 'bigint')
    return { $type: 'bigint', value: value.toString() };

  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $type: 'number', value: 'NaN' };
    if (value === Infinity) return { $type: 'number', value: 'Infinity' };
    if (value === -Infinity) return { $type: 'number', value: '-Infinity' };
    // -0 handled by JCS (becomes 0)
    return value;
  }

  if (value instanceof Date) {
    return { $type: 'date', value: Number.isNaN(value.getTime()) ? null : value.toISOString() };
  }

  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;

  // Circular reference detection
  if (!seen) seen = new Map();
  if (!path) path = '';

  if (seen.has(value)) {
    return { $type: 'circular', path: seen.get(value) };
  }
  seen.set(value, path);

  try {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      const bytes = value instanceof ArrayBuffer
        ? Buffer.from(value)
        : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      return {
        $type: 'binary',
        encoding: 'base64',
        bytes: bytes.length,
        value: bytes.toString('base64').slice(0, 1024),
      };
    }

    if (Array.isArray(value)) {
      return value.map((item, i) => normalizeValue(item, seen, `${path}/${i}`));
    }

    if (typeof value === 'object') {
      const result = {};
      const keys = Object.keys(value).sort();
      for (const key of keys) {
        try {
          result[key] = normalizeValue(value[key], seen, `${path}/${key}`);
        } catch (e) {
          result[key] = { $type: 'property-error', name: e?.name || 'Error' };
        }
      }
      return result;
    }
    return String(value);
  } finally {
    seen.delete(value);
  }
}

// RFC 8785 (JCS) - JSON Canonicalization Scheme
// Deterministic serialization: sorted keys, specific number formatting
function jcsStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return '0';
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map(item => jcsStringify(item));
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map(key => `${JSON.stringify(key)}:${jcsStringify(value[key])}`);
    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(value);
}

function computeCanonicalBytes(event) {
  const canonical = {
    sessionId: event.sessionId,
    sequence: event.sequence,
    timestamp: event.timestamp,
    type: event.type,
    severity: event.severity,
    data: normalizeValue(event.data),
  };
  return Buffer.from(jcsStringify(canonical), 'utf8');
}

function computePayloadHash(event) {
  const bytes = computeCanonicalBytes(event);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifyPayloadHash(event, expectedHash) {
  const actual = computePayloadHash(event);
  return actual === expectedHash;
}

module.exports = {
  CANONICAL_VERSION,
  normalizeValue,
  jcsStringify,
  computeCanonicalBytes,
  computePayloadHash,
  verifyPayloadHash,
};
