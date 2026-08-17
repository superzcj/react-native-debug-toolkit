'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { HubStore } = require('../src/storage/hubStore');

const APP_ID = 'com.example.paginate';

async function openHubWithSessions(count) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-hubstore-'));
  const hub = new HubStore(dir);
  await hub.initialize();
  const ids = [];
  for (let i = 1; i <= count; i += 1) {
    const sessionId = `sess-${String(i).padStart(3, '0')}`;
    ids.push(sessionId);
    await hub.openSession(APP_ID, sessionId, {
      device: { platform: 'ios', nativeApplicationId: APP_ID },
      startedAt: Date.now(),
    }, '10.0.0.1');
  }
  return { hub, dir, ids };
}

describe('HubStore.listSessions pagination', () => {
  it('pages 55 Sessions stably by sessionId even after a heartbeat', async () => {
    const { hub, dir, ids } = await openHubWithSessions(55);
    try {
      const page1 = hub.listSessions(APP_ID, { limit: 20, order: 'sessionId' });
      expect(page1.sessions).toHaveLength(20);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeTruthy();
      expect(page1.total).toBe(55);

      await hub.getSession(page1.sessions[0].sessionId).heartbeat('live');

      const page2 = hub.listSessions(APP_ID, {
        limit: 20,
        order: 'sessionId',
        cursor: page1.nextCursor,
      });
      expect(page2.sessions).toHaveLength(20);
      expect(page2.hasMore).toBe(true);

      const page3 = hub.listSessions(APP_ID, {
        limit: 20,
        order: 'sessionId',
        cursor: page2.nextCursor,
      });
      expect(page3.sessions).toHaveLength(15);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      const all = [
        ...page1.sessions,
        ...page2.sessions,
        ...page3.sessions,
      ].map((session) => session.sessionId);
      expect(new Set(all).size).toBe(55);
      expect(all.sort()).toEqual([...ids].sort());
    } finally {
      hub.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects activity-order cursors and malformed sessionId cursors', async () => {
    const { hub, dir } = await openHubWithSessions(3);
    try {
      try {
        hub.listSessions(APP_ID, { order: 'activity', cursor: 'abc' });
        throw new Error('expected activity cursor to fail');
      } catch (err) {
        expect(err.code).toBe('CURSOR_INVALID');
      }

      try {
        hub.listSessions(APP_ID, { order: 'sessionId', cursor: '%%%' });
        throw new Error('expected malformed cursor to fail');
      } catch (err) {
        expect(err.code).toBe('CURSOR_INVALID');
      }
    } finally {
      hub.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('attaches observation summaries only when eventWindow is provided', async () => {
    const { hub, dir } = await openHubWithSessions(2);
    try {
      const inWindow = Date.parse('2026-08-17T02:32:00.000Z');
      const outWindow = Date.parse('2026-08-17T01:00:00.000Z');
      const live = hub.getSession('sess-001');
      const historical = hub.getSession('sess-002');
      await live.appendEvents(1, [{
        sequence: 1,
        timestamp: inWindow,
        type: 'console',
        severity: 'info',
        data: { message: 'in' },
      }]);
      await historical.appendEvents(1, [{
        sequence: 1,
        timestamp: outWindow,
        type: 'console',
        severity: 'info',
        data: { message: 'out' },
      }]);

      const plain = hub.listSessions(APP_ID, { order: 'sessionId', limit: 20 });
      expect(plain.sessions.every((session) => session.observation == null)).toBe(true);

      const windowed = hub.listSessions(APP_ID, {
        order: 'sessionId',
        limit: 20,
        eventWindow: {
          sinceMs: inWindow - 60_000,
          untilMs: inWindow + 60_000,
          timeBasis: 'event',
        },
      });
      const byId = Object.fromEntries(windowed.sessions.map((session) => [session.sessionId, session]));
      expect(byId['sess-001'].observation.matchedEventCount).toBe(1);
      expect(byId['sess-002'].observation.matchedEventCount).toBe(0);
      expect(byId['sess-002'].observation.eventTimeRange).not.toBeNull();
      expect(byId['sess-002'].observation.nearestEventTimestamp).toBe('2026-08-17T01:00:00.000Z');
    } finally {
      hub.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
