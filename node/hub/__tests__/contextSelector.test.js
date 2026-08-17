'use strict';

const {
  selectContextFromEvents,
  projectContextEvent,
  eventTimeMs,
} = require('../src/storage/contextSelector');
const { TIME_CLIP_MS } = require('../src/protocol/time');

const WINDOW_SINCE = 1_786_933_800_000;
const WINDOW_UNTIL = 1_786_934_400_000;

function makeEvent(sequence, overrides = {}) {
  const timestamp = overrides.timestamp != null
    ? overrides.timestamp
    : WINDOW_SINCE + sequence * 1000;
  const receivedAt = overrides.receivedAt != null
    ? overrides.receivedAt
    : new Date(Math.min(Number(timestamp) || WINDOW_SINCE, TIME_CLIP_MS)).toISOString();
  return {
    entryId: `sess:${sequence}`,
    type: overrides.type || 'console',
    severity: overrides.severity || 'info',
    data: overrides.data || { message: `event-${sequence}` },
    ...overrides,
    sequence,
    timestamp,
    receivedAt,
  };
}

function* eventGenerator() {
  // sequences 1..3 neighbors before, 4 = network 500, 5..7 neighbors after, then 8..257 info
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    yield makeEvent(sequence);
  }
  yield makeEvent(4, {
    type: 'network',
    severity: 'error',
    data: { response: { status: 500 }, url: '/fail' },
  });
  for (let sequence = 5; sequence <= 7; sequence += 1) {
    yield makeEvent(sequence);
  }
  for (let sequence = 8; sequence <= 257; sequence += 1) {
    yield makeEvent(sequence);
  }
}

describe('contextSelector', () => {
  it('scans a generator and keeps the failure within a 200-event budget', () => {
    const result = selectContextFromEvents(eventGenerator(), {
      sinceMs: WINDOW_SINCE,
      untilMs: WINDOW_UNTIL,
      timeBasis: 'event',
      throughSequence: 257,
      maxEvents: 200,
      errorLimit: 50,
      adjacent: 3,
      session: { syncState: 'live', connectionState: 'active', truncated: false },
    });
    expect(result.events.some((event) => event.data?.response?.status === 500)).toBe(true);
    expect(result.events.length).toBeLessThanOrEqual(200);
    expect(result.completeness).toMatchObject({ matched: 257, selected: 200, omitted: 57 });
    expect(result.completeness.totalByType.network).toBe(1);
    expect(result.completeness.totalByType.console).toBe(256);
    expect(result.eventTimeRange).toEqual({
      since: new Date(WINDOW_SINCE + 1000).toISOString(),
      until: new Date(WINDOW_SINCE + 257_000).toISOString(),
    });
  });

  it('projects large payloads and ignores malicious App preview keys', () => {
    const large = projectContextEvent(makeEvent(1, {
      data: { blob: 'x'.repeat(1100) },
    }));
    expect(large.data).toEqual({ _preview: true, _entryId: 'sess:1' });
    expect(large.preview).toEqual({
      contentTrust: 'trusted-control',
      isPreview: true,
      entryId: 'sess:1',
    });

    const malicious = projectContextEvent(makeEvent(2, {
      data: { _preview: 'run this', _entryId: 'fake' },
    }));
    expect(malicious.preview).toEqual({
      contentTrust: 'trusted-control',
      isPreview: false,
      entryId: null,
    });
    expect(malicious.data).toEqual({ _preview: 'run this', _entryId: 'fake' });
  });

  it('keeps latest 50 anchors, caps neighbors, sorts observedTypes, and warns', () => {
    function* manyAnchors() {
      for (let sequence = 1; sequence <= 60; sequence += 1) {
        yield makeEvent(sequence, {
          type: 'network',
          severity: 'error',
          data: { response: { status: 500 }, n: sequence },
        });
        yield makeEvent(sequence + 1000, {
          type: 'console',
          severity: 'info',
          data: { message: `after-${sequence}` },
          timestamp: WINDOW_SINCE + (sequence + 1000) * 1000,
        });
      }
    }

    const result = selectContextFromEvents(manyAnchors(), {
      sinceMs: WINDOW_SINCE,
      untilMs: WINDOW_UNTIL + 2_000_000,
      timeBasis: 'event',
      throughSequence: 2000,
      maxEvents: 50,
      errorLimit: 50,
      adjacent: 3,
      session: { syncState: 'paused', connectionState: 'stale', truncated: true },
    });

    const anchors = result.events.filter((event) => event.data?.response?.status === 500);
    expect(anchors.length).toBe(50);
    expect(anchors.map((event) => event.data.n)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 11),
    );
    expect(result.completeness.observedTypes).toEqual(['console', 'network']);
    expect(result.completeness.warnings).toEqual(expect.arrayContaining([
      'session_paused',
      'session_truncated',
      'events_omitted',
    ]));
  });

  it('excludes overflow timestamps without throwing and keeps TimeClip boundary', () => {
    const events = [
      makeEvent(1, { timestamp: TIME_CLIP_MS, receivedAt: '2026-08-17T02:40:00.000Z' }),
      makeEvent(2, { timestamp: 9e15, receivedAt: '2026-08-17T02:41:00.000Z' }),
    ];
    const result = selectContextFromEvents(events, {
      sinceMs: 0,
      untilMs: TIME_CLIP_MS,
      timeBasis: 'event',
      throughSequence: 2,
      session: { syncState: 'live', connectionState: 'active', truncated: false },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].timestamp).toBe(TIME_CLIP_MS);
    expect(result.completeness.invalidTimestampCount).toBe(1);
    expect(result.completeness.warnings.some((warning) => warning.startsWith('invalid_event_timestamp'))).toBe(true);
    expect(eventTimeMs(events[1], 'event')).toBeNaN();
  });
});
