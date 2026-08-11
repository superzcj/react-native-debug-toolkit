'use strict';

const crypto = require('crypto');

const SIGNER_VERSION = 1;

function createCursorSigner(hmacKey) {
  function sign(payload) {
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json).toString('base64url');
    const mac = crypto.createHmac('sha256', hmacKey)
      .update(encoded)
      .digest('base64url');
    return `v${SIGNER_VERSION}.${encoded}.${mac}`;
  }

  function verify(cursor) {
    if (typeof cursor !== 'string') return null;
    const parts = cursor.split('.');
    if (parts.length !== 3) return null;
    if (parts[0] !== `v${SIGNER_VERSION}`) return null;

    const encoded = parts[1];
    const mac = parts[2];

    const expectedMac = crypto.createHmac('sha256', hmacKey)
      .update(encoded)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac))) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString());
    } catch {
      return null;
    }
  }

  return { sign, verify };
}

function createEventCursor(signer, sessionId, sequence) {
  return signer.sign({
    kind: 'event',
    signerVersion: SIGNER_VERSION,
    sessionId,
    sequence,
  });
}

function createSnapshotCursor(signer, sessionId, throughSequence, capturedAt, params) {
  return signer.sign({
    kind: 'snapshot',
    signerVersion: SIGNER_VERSION,
    sessionId,
    throughSequence,
    capturedAt,
    params: params || {},
  });
}

function createBaselineCursor(signer, sessionId, sequence, retentionGapVersion) {
  return signer.sign({
    kind: 'baseline',
    signerVersion: SIGNER_VERSION,
    sessionId,
    sequence,
    retentionGapVersion,
  });
}

function parseCursor(signer, cursor, expectedSessionId) {
  const payload = signer.verify(cursor);
  if (!payload) return { valid: false, code: 'CURSOR_INVALID' };
  if (expectedSessionId && payload.sessionId !== expectedSessionId) {
    return { valid: false, code: 'CURSOR_INVALID' };
  }
  return { valid: true, payload };
}

module.exports = {
  SIGNER_VERSION,
  createCursorSigner,
  createEventCursor,
  createSnapshotCursor,
  createBaselineCursor,
  parseCursor,
};
