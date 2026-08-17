'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createResumeState,
  validateResumeState,
  encodeResumeToken,
  decodeResumeToken,
  mergeResumeOptions,
  loadAndMergeResumeState,
  deriveResumeState,
  buildResumeArgs,
  validateContinuationArgv,
  MISSING_SESSION_AUTH,
  EVIDENCE_PROJECTION_AUTH,
} = require('../src/cli/diagnoseResumeToken');

describe('diagnoseResumeToken round-trip and corruption', () => {
  it('round-trips a canonical state', () => {
    const state = createResumeState({
      hub: 'http://10.0.0.2:3800',
      appId: 'com.example.app',
      at: '2026-08-17T10:32:00+08:00',
      allowStale: false,
    });
    const decoded = decodeResumeToken(encodeResumeToken(state));
    expect(decoded).toEqual({ ok: true, state });
  });

  it('rejects corrupt and invalid tokens', () => {
    expect(decodeResumeToken('v1.not-json.bad')).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
    });
    const state = createResumeState({ hub: 'http://10.0.0.2:3800' });
    const token = encodeResumeToken(state);
    const parts = token.split('.');
    expect(decodeResumeToken(`v99.${parts[1]}.${parts[2]}`)).toMatchObject({ ok: false });
    expect(decodeResumeToken(`v1.${parts[1]}.deadbeef`)).toMatchObject({ ok: false });

    const badKey = structuredClone(state);
    badKey.extra = true;
    const payload = Buffer.from(JSON.stringify(badKey), 'utf8').toString('base64url');
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(payload, 'utf8').digest('base64url');
    expect(decodeResumeToken(`v1.${payload}.${checksum}`)).toMatchObject({ ok: false });
  });

  it('rejects invalid endpoints, times, flags, attempts, and target matches on validate', () => {
    expect(validateResumeState(createResumeState({ hub: 'not-a-url' })).ok).toBe(false);
    expect(validateResumeState(createResumeState({ at: '08/17/2026' })).ok).toBe(false);
    expect(validateResumeState(createResumeState({ at: '2026-08-17T10:32:00' })).ok).toBe(false);
    expect(validateResumeState(createResumeState({ at: '2026-02-30T10:00:00+08:00' })).ok).toBe(false);
    expect(validateResumeState(createResumeState({ at: '2026-08-17T10:32:00+25:00' })).ok).toBe(false);

    const stale = createResumeState({});
    stale.stale.allow = 'yes';
    expect(validateResumeState(stale).ok).toBe(false);

    const attempts = createResumeState({});
    attempts.attempts.CAPTURE_LOGS = 1.5;
    expect(validateResumeState(attempts).ok).toBe(false);

    expect(deriveResumeState(createResumeState({}), {
      setTargetMatch: '',
    }).ok).toBe(false);
    expect(deriveResumeState(createResumeState({}), {
      setTargetMatch: 'x'.repeat(513),
    }).ok).toBe(false);
    expect(deriveResumeState(createResumeState({}), {
      setTargetMatch: Array.from({ length: 33 }, (_, i) => `t${i}`).join(' '),
    }).ok).toBe(false);
    expect(deriveResumeState(createResumeState({}), {
      setTargetMatch: `ok ${'y'.repeat(129)}`,
    }).ok).toBe(false);
  });
});

describe('diagnoseResumeToken merge, transitions, and argv', () => {
  it('rejects Hub switches and selected App/Session argv changes', () => {
    let state = createResumeState({ hub: 'http://10.0.0.1:3800', appId: 'app.a' });
    state = deriveResumeState(state, {
      select: { hub: 'http://10.0.0.1:3800', appId: 'app.a', sessionId: 'sess-1' },
    }).state;

    expect(mergeResumeOptions(state, { hub: 'http://10.0.0.2:3800' }).ok).toBe(false);
    expect(mergeResumeOptions(state, { appId: 'app.b' }).ok).toBe(false);
    expect(mergeResumeOptions(state, { session: 'sess-2' }).ok).toBe(false);
  });

  it('allows allow-stale false→true and range narrowing only', () => {
    const state = createResumeState({
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    });
    expect(mergeResumeOptions(state, { allowStale: true }).state.stale.allow).toBe(true);
    expect(mergeResumeOptions(state, {
      since: '2026-08-17T02:10:00.000Z',
      until: '2026-08-17T02:50:00.000Z',
    }).ok).toBe(true);
    expect(mergeResumeOptions(state, {
      since: '2026-08-17T01:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    }).ok).toBe(false);
  });

  it('allows one CONFIRM_TIME replacement then rejects a second', () => {
    let state = createResumeState({
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    });
    state = deriveResumeState(state, { incrementAction: 'CONFIRM_TIME' }).state;
    const first = mergeResumeOptions(state, {
      since: '2026-08-17T04:00:00.000Z',
      until: '2026-08-17T04:30:00.000Z',
    });
    expect(first.ok).toBe(true);
    expect(first.state.time.confirmationUsed).toBe(true);
    expect(mergeResumeOptions(first.state, {
      since: '2026-08-17T05:00:00.000Z',
      until: '2026-08-17T05:10:00.000Z',
    }).ok).toBe(false);
  });

  it('handles CONFIRM_TARGET one-shot answer rules', () => {
    let state = createResumeState({});
    state = deriveResumeState(state, { incrementAction: 'CONFIRM_TARGET' }).state;
    expect(mergeResumeOptions(state, {}).ok).toBe(false);

    const answered = mergeResumeOptions(state, {
      targetMatch: 'iPhone 15 $(touch should-not-exist);',
      at: '2026-08-17T10:32:00+08:00',
    });
    expect(answered.ok).toBe(true);
    expect(answered.state.targetConfirmationUsed).toBe(true);
    expect(answered.state.targetMatch).toContain('$(touch should-not-exist)');

    expect(mergeResumeOptions(answered.state, { targetMatch: 'again' }).ok).toBe(false);

    let explicit = createResumeState({
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    });
    explicit = deriveResumeState(explicit, { incrementAction: 'CONFIRM_TARGET' }).state;
    expect(mergeResumeOptions(explicit, {
      targetMatch: 'iphone',
      since: '2026-08-17T01:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    }).ok).toBe(false);
  });

  it('releaseSessionForCapture and bindEvidenceWindow require trusted auth', () => {
    let state = createResumeState({ hub: 'http://10.0.0.1:3800' });
    state = deriveResumeState(state, {
      select: { hub: 'http://10.0.0.1:3800', appId: 'app.a', sessionId: 'sess-1' },
    }).state;

    expect(deriveResumeState(state, { releaseSessionForCapture: true }).ok).toBe(false);
    const released = deriveResumeState(state, { releaseSessionForCapture: MISSING_SESSION_AUTH });
    expect(released.ok).toBe(true);
    expect(released.state.selected.sessionId).toBeNull();
    expect(released.state.discovery.sessionId).toBeNull();
    expect(released.state.sessionReleasedForCapture).toBe(true);
    expect(released.state.selected.hub).toBe('http://10.0.0.1:3800');
    expect(released.state.selected.appId).toBe('app.a');

    const args = buildResumeArgs(released.state);
    expect(args).not.toContain('--session');
    expect(mergeResumeOptions(released.state, { session: 'sess-2' }).ok).toBe(false);

    const reselected = deriveResumeState(released.state, {
      select: { hub: 'http://10.0.0.1:3800', appId: 'app.a', sessionId: 'sess-2' },
    });
    expect(reselected.ok).toBe(true);

    let timed = createResumeState({
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    });
    expect(deriveResumeState(timed, {
      bindEvidenceWindow: { sinceMs: 1_786_934_000_000, untilMs: 1_786_934_100_000 },
    }).ok).toBe(false);

    const bound = deriveResumeState(timed, {
      bindEvidenceWindow: {
        auth: EVIDENCE_PROJECTION_AUTH,
        sinceMs: Date.parse('2026-08-17T02:10:00.000Z'),
        untilMs: Date.parse('2026-08-17T02:50:00.000Z'),
      },
    });
    expect(bound.ok).toBe(true);
    expect(bound.state.time.kind).toBe('range');
    expect(bound.state.time.confirmationUsed).toBe(false);

    expect(deriveResumeState(timed, {
      bindEvidenceWindow: {
        auth: EVIDENCE_PROJECTION_AUTH,
        sinceMs: Date.parse('2026-08-17T01:00:00.000Z'),
        untilMs: Date.parse('2026-08-17T03:00:00.000Z'),
      },
    }).ok).toBe(false);
  });

  it('buildResumeArgs omits time when requested and never re-emits target-match', () => {
    let state = createResumeState({
      hub: 'http://10.0.0.2:3800',
      at: '2026-08-17T10:32:00+08:00',
    });
    state = deriveResumeState(state, {
      select: { hub: 'http://10.0.0.2:3800', appId: 'com.example.app', sessionId: 'sess-1' },
      setTargetMatch: 'iPhone 15 $(touch should-not-exist);',
    }).state;

    const full = buildResumeArgs(state);
    expect(full.slice(0, 4)).toEqual(['npx', '--no-install', 'debug-toolkit', 'diagnose']);
    expect(full).toContain('--at');
    expect(full).not.toContain('--target-match');
    expect(full.join(' ')).not.toContain('should-not-exist');

    const omitted = buildResumeArgs(state, { omitTime: true });
    expect(omitted).not.toContain('--at');
    expect(omitted).toContain('--resume-token');

    const sentinel = path.join(os.tmpdir(), `diagnose-sentinel-${process.pid}`);
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('validateContinuationArgv enforces prefix, flags, and projection', () => {
    const state = createResumeState({
      hub: 'http://10.0.0.2:3800',
      appId: 'com.example.app',
      at: '2026-08-17T10:32:00+08:00',
    });
    const good = buildResumeArgs(state);
    expect(validateContinuationArgv(good, {
      purposeState: 'action_required',
      purposeCode: 'ALLOW_STALE',
    })).toEqual({ ok: true });

    expect(validateContinuationArgv(['sh', '-c', 'echo hi'], {
      purposeState: 'action_required',
      purposeCode: 'ALLOW_STALE',
    }).ok).toBe(false);

    expect(validateContinuationArgv([...good, '--hub', 'http://1.2.3.4:3800'], {
      purposeState: 'action_required',
      purposeCode: 'ALLOW_STALE',
    }).ok).toBe(false);

    const noToken = good.slice(0, -2);
    expect(validateContinuationArgv(noToken, {
      purposeState: 'action_required',
      purposeCode: 'ALLOW_STALE',
    }).ok).toBe(false);

    const omitIllegal = buildResumeArgs(state, { omitTime: true });
    expect(validateContinuationArgv(omitIllegal, {
      purposeState: 'action_required',
      purposeCode: 'ALLOW_STALE',
    }).ok).toBe(false);
    expect(validateContinuationArgv(omitIllegal, {
      purposeState: 'action_required',
      purposeCode: 'CONFIRM_TIME',
    })).toEqual({ ok: true });
  });

  it('loadAndMergeResumeState never falls back after token errors', () => {
    expect(loadAndMergeResumeState({ resumeToken: 'v1.bad.bad', hub: 'http://127.0.0.1:3800' }))
      .toMatchObject({ ok: false });
    expect(loadAndMergeResumeState({ hub: 'http://127.0.0.1:3800' }).ok).toBe(true);
  });
});
