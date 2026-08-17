'use strict';

/** JavaScript TimeClip / ISO convertible upper bound (inclusive). */
const TIME_CLIP_MS = 8.64e15;

/**
 * Positive safe integer occurrence/instant milliseconds within TimeClip.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidTimestampMs(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > TIME_CLIP_MS) {
    return false;
  }
  return Number.isFinite(new Date(value).getTime());
}

/**
 * Convert validated epoch ms to ISO-8601 UTC string, or null outside domain.
 * @param {unknown} ms
 * @returns {string|null}
 */
function toIsoInstant(ms) {
  if (!isValidTimestampMs(ms)) {
    return null;
  }
  return new Date(ms).toISOString();
}

// Ordinary YYYY and signed six-digit expanded years (TimeClip boundary).
// Zone must be Z or ±HH:MM — never rely on permissive Date.parse.
const ISO_INSTANT_RE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Strict offset-bearing ISO-8601 parse.
 * @param {unknown} value
 * @returns {number|null}
 */
function parseIsoInstant(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return null;
  }

  const match = ISO_INSTANT_RE.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] || '';
  const zone = match[8];

  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const oh = Number(zone.slice(1, 3));
    const om = Number(zone.slice(4, 6));
    if (!Number.isInteger(oh) || !Number.isInteger(om) || oh > 23 || om > 59) {
      return null;
    }
    offsetMinutes = sign * (oh * 60 + om);
  }

  const msText = `${fraction}000`.slice(0, 3);
  const msFraction = Number(msText);
  if (!Number.isInteger(msFraction)) {
    return null;
  }

  const civilAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, msFraction);
  const civil = new Date(civilAsUtc);
  if (
    Number.isNaN(civil.getTime())
    || civil.getUTCFullYear() !== year
    || civil.getUTCMonth() + 1 !== month
    || civil.getUTCDate() !== day
    || civil.getUTCHours() !== hour
    || civil.getUTCMinutes() !== minute
    || civil.getUTCSeconds() !== second
  ) {
    return null;
  }

  const utcMs = civilAsUtc - offsetMinutes * 60_000;
  if (!isValidTimestampMs(utcMs)) {
    return null;
  }

  return utcMs;
}

module.exports = {
  TIME_CLIP_MS,
  isValidTimestampMs,
  parseIsoInstant,
  toIsoInstant,
};
