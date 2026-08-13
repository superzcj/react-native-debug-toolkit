'use strict';

const {
  APP_ID_PATTERN, TYPE_PATTERN, SESSION_ID_LENGTH, SEVERITIES,
  PLATFORM_MAX_BYTES, OS_VERSION_MAX_BYTES, MANUFACTURER_MAX_BYTES,
  MODEL_MAX_BYTES, APP_VERSION_MAX_BYTES, BUILD_NUMBER_MAX_BYTES,
  NATIVE_APP_ID_MAX_BYTES, MAX_EVENT_WIRE_BYTES,
} = require('./constants');

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENDPOINT_RE = /^http:\/\/[^/\s@:]+(?::\d+)?$/;
const RFC1918_RE = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;
const LOOPBACK_RE = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|localhost|::1)$/i;

function isValidAppId(value) {
  return typeof value === 'string' && APP_ID_PATTERN.test(value);
}

function isValidSessionId(value) {
  return typeof value === 'string' && value.length === SESSION_ID_LENGTH && UUID_V4_RE.test(value);
}

function isValidEventType(value) {
  return typeof value === 'string' && TYPE_PATTERN.test(value);
}

function isValidSeverity(value) {
  return typeof value === 'string' && SEVERITIES.includes(value);
}

function normalizeSeverity(value) {
  if (isValidSeverity(value)) return value;
  const lower = typeof value === 'string' ? value.toLowerCase() : '';
  if (SEVERITIES.includes(lower)) return lower;
  return 'info';
}

function isValidSequence(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isValidPayloadHash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function utf8ByteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

function validateStringField(value, maxBytes, fieldName) {
  if (typeof value !== 'string') return `${fieldName} must be a string`;
  if (utf8ByteLength(value) > maxBytes) return `${fieldName} exceeds ${maxBytes} byte limit`;
  return null;
}

function validateDeviceMetadata(device) {
  if (!device || typeof device !== 'object') return 'device metadata is required';
  const errors = [];

  if (!device.platform || typeof device.platform !== 'string')
    errors.push('platform is required');
  else {
    const e = validateStringField(device.platform, PLATFORM_MAX_BYTES, 'platform');
    if (e) errors.push(e);
  }

  const optional = [
    ['osVersion', OS_VERSION_MAX_BYTES],
    ['manufacturer', MANUFACTURER_MAX_BYTES],
    ['model', MODEL_MAX_BYTES],
    ['appVersion', APP_VERSION_MAX_BYTES],
    ['buildNumber', BUILD_NUMBER_MAX_BYTES],
    ['nativeApplicationId', NATIVE_APP_ID_MAX_BYTES],
  ];

  for (const [field, max] of optional) {
    if (device[field] !== undefined && device[field] !== null) {
      const e = validateStringField(device[field], max, field);
      if (e) errors.push(e);
    }
  }

  return errors.length > 0 ? errors.join('; ') : null;
}

function normalizeEndpoint(value) {
  if (!value || typeof value !== 'string') return null;
  let trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  // If no protocol, try to add http://
  if (!/^https?:\/\//i.test(trimmed)) {
    // Bare IPv4 or hostname
    if (/^[\d.]+$/.test(trimmed) || /^[a-zA-Z][\w.-]*$/.test(trimmed)) {
      trimmed = `http://${trimmed}:3800`;
    } else if (/^[\d.]+:\d+$/.test(trimmed) || /^[a-zA-Z][\w.-]*:\d+$/.test(trimmed)) {
      trimmed = `http://${trimmed}`;
    } else {
      return null;
    }
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:') return null;
    if (!url.hostname) return null;
    if (url.username || url.password) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    if (url.search || url.hash) return null;

    const port = url.port || '3800';
    return `http://${url.hostname}:${port}`;
  } catch {
    return null;
  }
}

function isPrivateIp(ip) {
  return RFC1918_RE.test(ip) || LOOPBACK_RE.test(ip);
}

function isLoopback(host) {
  return LOOPBACK_RE.test(host);
}

function validateWireEvent(event) {
  if (!event || typeof event !== 'object') return 'event must be an object';

  if (!isValidSequence(event.sequence))
    return 'invalid sequence number';
  if (!Number.isSafeInteger(event.timestamp) || event.timestamp <= 0)
    return 'invalid timestamp';
  if (!isValidEventType(event.type))
    return 'invalid event type';

  const severity = normalizeSeverity(event.severity);
  if (!severity) return 'invalid severity';

  if (event.payloadHash === undefined) return 'payloadHash is required';
  if (!isValidPayloadHash(event.payloadHash)) return 'invalid payloadHash';

  const serialized = JSON.stringify(event);
  if (utf8ByteLength(serialized) > MAX_EVENT_WIRE_BYTES)
    return `event exceeds ${MAX_EVENT_WIRE_BYTES} byte wire limit`;

  return null;
}

module.exports = {
  isValidAppId,
  isValidSessionId,
  isValidEventType,
  isValidSeverity,
  normalizeSeverity,
  isValidSequence,
  isValidPayloadHash,
  utf8ByteLength,
  validateStringField,
  validateDeviceMetadata,
  normalizeEndpoint,
  isPrivateIp,
  isLoopback,
  validateWireEvent,
  UUID_V4_RE,
  ENDPOINT_RE,
  RFC1918_RE,
  LOOPBACK_RE,
};
