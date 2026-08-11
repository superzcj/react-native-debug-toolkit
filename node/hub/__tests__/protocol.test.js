'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateWireEvent } = require('../src/protocol/validation');
const { computePayloadHash } = require('../src/protocol/canonical');
const { SessionStore } = require('../src/storage/sessionStore');
const { SessionLedger } = require('../src/storage/sessionLedger');

const sessionId = '123e4567-e89b-42d3-a456-426614174000';

function wireEvent(hash) {
  return {
    sequence: 1,
    timestamp: 1700000000000,
    type: 'toolkit.manual_sync',
    severity: 'info',
    data: { trigger: 'button' },
    payloadHash: hash,
  };
}

describe('Shared Hub protocol', () => {
  it('requires the client payload hash on every wire event', () => {
    expect(validateWireEvent({ ...wireEvent(undefined), payloadHash: undefined }))
      .toBe('payloadHash is required');
  });

  it('rejects a syntactically valid but mismatched payload hash before persistence', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-hub-'));
    const store = new SessionStore(dir, 'com.example.audit', sessionId);
    store.initialize();
    const opened = await store.open({
      device: { platform: 'ios', nativeApplicationId: 'com.example.audit' },
      startedAt: Date.now(),
    }, '10.0.0.1');
    const result = await store.appendEvents(opened.generation, 1, [wireEvent('0'.repeat(64))]);

    expect(result).toMatchObject({ ok: false, code: 'PAYLOAD_HASH_MISMATCH' });
    expect(store.getSessionInfo().ackThrough).toBe(0);
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the cross-runtime canonical hash vector stable', () => {
    const event = wireEvent('');
    expect(computePayloadHash({ ...event, sessionId }))
      .toBe('538fc3dc66a347a75d45b1582a4b5ef2a755934500702a0fd3555ce0d9563905');
  });

  it('preserves the ACK checkpoint after ledger compaction and reload', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-ledger-'));
    const ledgerPath = path.join(dir, 'session.ledger.jsonl');
    const ledger = new SessionLedger(ledgerPath);
    ledger.load();
    await ledger.append({ type: 'session_open', sessionId, generation: 'first' });
    await ledger.append({ type: 'generation_change', generation: 'first' });
    await ledger.append({ type: 'batch_commit', ackThrough: 42 });
    await ledger._compact();

    const reloaded = new SessionLedger(ledgerPath);
    reloaded.load();
    expect(reloaded.getAckThrough()).toBe(42);
    expect(reloaded.getExpectedSequence()).toBe(43);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('removes an uncommitted complete segment tail on restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-recovery-'));
    const store = new SessionStore(dir, 'com.example.audit', sessionId);
    store.initialize();
    await store.open({ device: { platform: 'ios' }, startedAt: Date.now() }, '10.0.0.1');
    store._writer.appendEvents([{ sequence: 1, receivedAt: new Date().toISOString(), type: 'console' }]);
    store.close();

    const restarted = new SessionStore(dir, 'com.example.audit', sessionId);
    restarted.initialize();
    expect(restarted.queryEvents({ limit: 10 }).events).toEqual([]);
    restarted.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
