'use strict';

const {
  isValidTimestampMs,
  parseIsoInstant,
  toIsoInstant,
  TIME_CLIP_MS,
} = require('../src/protocol/time');

describe('protocol/time', () => {
  describe('isValidTimestampMs', () => {
    it('accepts positive safe integers within TimeClip', () => {
      expect(isValidTimestampMs(1)).toBe(true);
      expect(isValidTimestampMs(1_786_934_400_000)).toBe(true);
      expect(isValidTimestampMs(TIME_CLIP_MS)).toBe(true);
    });

    it('rejects non-positive, unsafe, overflow, and non-integers', () => {
      expect(isValidTimestampMs(0)).toBe(false);
      expect(isValidTimestampMs(-1)).toBe(false);
      expect(isValidTimestampMs(9e15)).toBe(false);
      expect(isValidTimestampMs(1.5)).toBe(false);
      expect(isValidTimestampMs(Number.NaN)).toBe(false);
      expect(isValidTimestampMs('1700000000000')).toBe(false);
      expect(isValidTimestampMs(null)).toBe(false);
    });
  });

  describe('toIsoInstant', () => {
    it('returns ISO for in-domain values including TimeClip boundary', () => {
      expect(toIsoInstant(TIME_CLIP_MS)).toBe('+275760-09-13T00:00:00.000Z');
      expect(toIsoInstant(1_700_000_000_000)).toBe('2023-11-14T22:13:20.000Z');
    });

    it('returns null outside domain', () => {
      expect(toIsoInstant(9e15)).toBeNull();
      expect(toIsoInstant(0)).toBeNull();
      expect(toIsoInstant(-5)).toBeNull();
    });
  });

  describe('parseIsoInstant', () => {
    it('accepts Z and numeric offsets', () => {
      expect(parseIsoInstant('2026-08-17T10:32:00Z')).toBe(Date.UTC(2026, 7, 17, 10, 32, 0));
      expect(parseIsoInstant('2026-08-17T10:32:00+08:00')).toBe(Date.UTC(2026, 7, 17, 2, 32, 0));
      expect(parseIsoInstant('2026-08-17T10:32:00.123-05:30')).toBe(
        Date.UTC(2026, 7, 17, 16, 2, 0, 123),
      );
    });

    it('accepts the signed expanded-year TimeClip boundary', () => {
      expect(parseIsoInstant('+275760-09-13T00:00:00.000Z')).toBe(TIME_CLIP_MS);
    });

    it('rejects locale dates, missing zones, invalid calendar days, and bad offsets', () => {
      expect(parseIsoInstant('08/17/2026')).toBeNull();
      expect(parseIsoInstant('2026-08-17T10:32:00')).toBeNull();
      expect(parseIsoInstant('2026-02-30T10:00:00+08:00')).toBeNull();
      expect(parseIsoInstant('2026-08-17T10:32:00+25:00')).toBeNull();
      expect(parseIsoInstant('2026-08-17T10:32:00+08:60')).toBeNull();
      expect(parseIsoInstant('not-a-date')).toBeNull();
      expect(parseIsoInstant('')).toBeNull();
      expect(parseIsoInstant(null)).toBeNull();
    });

    it('rejects instants outside the TimeClip domain', () => {
      expect(parseIsoInstant('+275760-09-13T00:00:00.001Z')).toBeNull();
      expect(parseIsoInstant('+275761-01-01T00:00:00Z')).toBeNull();
    });
  });
});
