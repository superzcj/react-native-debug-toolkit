'use strict';

const { MAX_ENVELOPE_BYTES, SEVERITIES } = require('./constants');
const { normalizeSeverity, utf8ByteLength } = require('./validation');

const SCHEMA_VERSION = 1;

function networkSeverity(event) {
  const data = event.data || {};
  const status = data.response?.status ?? data.status;
  if (data.error || (typeof status === 'number' && status >= 400)) {
    const base = normalizeSeverity(event.severity);
    if (SEVERITIES.indexOf(base) < SEVERITIES.indexOf('error')) return 'error';
  }
  return normalizeSeverity(event.severity);
}

function createEventEnvelope(wireEvent, sessionMeta) {
  const severity = wireEvent.type === 'network'
    ? networkSeverity(wireEvent)
    : normalizeSeverity(wireEvent.severity);

  const envelope = {
    recordKind: 'event',
    schemaVersion: SCHEMA_VERSION,
    entryId: `${sessionMeta.sessionId}:${wireEvent.sequence}`,
    appId: sessionMeta.appId,
    deviceId: sessionMeta.deviceId,
    sessionId: sessionMeta.sessionId,
    sequence: wireEvent.sequence,
    timestamp: wireEvent.timestamp,
    receivedAt: new Date().toISOString(),
    type: wireEvent.type,
    severity,
    contentTrust: 'untrusted',
    payloadHash: wireEvent.payloadHash || null,
    data: wireEvent.data || {},
  };

  return envelope;
}

function createControlRecord(type, sessionMeta, data) {
  return {
    recordKind: 'control',
    schemaVersion: SCHEMA_VERSION,
    entryId: `${sessionMeta.sessionId}:${data.sequence || 0}`,
    appId: sessionMeta.appId,
    deviceId: sessionMeta.deviceId,
    sessionId: sessionMeta.sessionId,
    sequence: data.sequence || 0,
    timestamp: Date.now(),
    receivedAt: new Date().toISOString(),
    type,
    severity: 'info',
    contentTrust: 'trusted-control',
    data: data || {},
  };
}

function validateEnvelopeSize(envelope) {
  const json = JSON.stringify(envelope);
  return utf8ByteLength(json) <= MAX_ENVELOPE_BYTES;
}

module.exports = {
  createEventEnvelope,
  createControlRecord,
  validateEnvelopeSize,
};
