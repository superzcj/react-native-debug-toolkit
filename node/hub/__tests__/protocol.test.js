'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateWireEvent } = require('../src/protocol/validation');
const { computePayloadHash } = require('../src/protocol/canonical');
const { SessionStore } = require('../src/storage/sessionStore');
const { sendJson } = require('../src/server/httpUtils');

const sessionId = '123e4567-e89b-42d3-a456-426614174000';

function wireEvent(overrides) {
  return {
    sequence: 1,
    timestamp: 1700000000000,
    type: 'console',
    severity: 'info',
    data: { message: 'hello' },
    ...overrides,
  };
}

describe('Local Hub protocol', () => {
  it('marks Hub responses as non-storable for mobile clients', () => {
    const response = { writeHead: jest.fn(), end: jest.fn() };

    sendJson(response, 200, { ok: true });

    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'cache-control': expect.stringContaining('no-store'),
      pragma: 'no-cache',
    }));
  });

  it('accepts wire events without payloadHash', () => {
    expect(validateWireEvent(wireEvent())).toBeNull();
  });

  it('appends events, ACKs duplicates, and restores ackThrough after restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-hub-'));
    const store = new SessionStore(dir, 'com.example.audit', sessionId);
    store.initialize();
    await store.open({
      device: { platform: 'ios', nativeApplicationId: 'com.example.audit' },
      startedAt: Date.now(),
    }, '10.0.0.1');

    const first = await store.appendEvents(1, [wireEvent()]);
    expect(first).toMatchObject({ ok: true, ackThrough: 1 });

    const duplicate = await store.appendEvents(1, [wireEvent()]);
    expect(duplicate).toMatchObject({ ok: true, ackThrough: 1 });
    expect(store.queryEvents({ limit: 10 }).events).toHaveLength(1);

    store.close();

    const restarted = new SessionStore(dir, 'com.example.audit', sessionId);
    restarted.initialize();
    expect(restarted.getSessionInfo().ackThrough).toBe(1);
    expect(restarted.queryEvents({ limit: 10 }).events).toHaveLength(1);
    restarted.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the cross-runtime canonical hash vector stable', () => {
    const event = wireEvent();
    expect(computePayloadHash({ ...event, sessionId }))
      .toBe('d81f12ba4811116fed294e3236a34a341f036a7e05d2e6bdf489656a784cb53b');
  });

  it('preserves dual clocks across summary, query, and restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-hub-'));
    const store = new SessionStore(dir, 'com.example.audit', sessionId);
    store.initialize();
    await store.open({
      device: { platform: 'ios', nativeApplicationId: 'com.example.audit' },
      startedAt: Date.now(),
    }, '10.0.0.1');

    const occurredAt = Date.parse('2026-08-17T02:32:00.000Z');
    const receivedAt = '2026-08-17T02:40:00.000Z';
    await store.appendEvents(1, [wireEvent({
      sequence: 1,
      timestamp: occurredAt,
      type: 'console',
      severity: 'error',
      data: { message: 'crash' },
    })]);
    store._events[0].receivedAt = receivedAt;
    fs.writeFileSync(store._eventsPath, `${JSON.stringify(store._events[0])}\n`);

    const summary = store.getEventWindowSummary({
      sinceMs: occurredAt - 60_000,
      untilMs: occurredAt + 60_000,
      timeBasis: 'event',
    });
    expect(summary.matchedEventCount).toBe(1);
    expect(summary.eventTimeRange).toEqual({
      since: '2026-08-17T02:32:00.000Z',
      until: '2026-08-17T02:32:00.000Z',
    });
    expect(summary.receivedTimeRange).toEqual({
      since: receivedAt,
      until: receivedAt,
    });

    expect(store.queryEvents({
      since: '2026-08-17T02:39:00.000Z',
      until: '2026-08-17T02:41:00.000Z',
      limit: 10,
    }).events).toHaveLength(1);
    expect(store.queryEvents({
      since: '2026-08-17T02:31:00.000Z',
      until: '2026-08-17T02:33:00.000Z',
      limit: 10,
      timeBasis: 'event',
    }).events).toHaveLength(1);
    expect(store.queryEvents({ limit: 10 }).events).toHaveLength(1);

    const empty = store.getEventWindowSummary({
      sinceMs: Date.parse('2026-08-17T03:00:00.000Z'),
      untilMs: Date.parse('2026-08-17T03:10:00.000Z'),
      timeBasis: 'event',
    });
    expect(empty.matchedEventCount).toBe(0);
    expect(empty.eventTimeRange).not.toBeNull();
    expect(empty.receivedTimeRange).not.toBeNull();
    expect(empty.nearestEventTimestamp).toBe('2026-08-17T02:32:00.000Z');

    store.close();
    const restarted = new SessionStore(dir, 'com.example.audit', sessionId);
    restarted.initialize();
    expect(restarted.queryEvents({ limit: 10 }).events[0]).toMatchObject({
      timestamp: occurredAt,
      receivedAt,
    });
    restarted.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
