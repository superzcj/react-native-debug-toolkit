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
});
