'use strict';

const {
  createResumeState,
  deriveResumeState,
  decodeResumeToken,
  mergeResumeOptions,
  MISSING_SESSION_AUTH,
  buildResumeArgs,
} = require('../src/cli/diagnoseResumeToken');
const { validateDiagnoseResult, getDiagnoseExitCode } = require('../src/cli/diagnoseResultSchema');
const { makeFinalTargetCandidate } = require('../src/cli/diagnoseTargetResolver');
const {
  materializeDiagnoseDecision,
  materializeHubFailure,
} = require('../src/cli/diagnoseActionState');

const NOW = 1_786_934_400_000;

function hubAttempt(overrides = {}) {
  return {
    endpoint: 'http://127.0.0.1:3800',
    phase: 'probe',
    kind: 'unreachable',
    code: 'ECONNREFUSED',
    httpStatus: null,
    appId: null,
    appCount: 0,
    pageCount: 0,
    sessionCount: 0,
    ...overrides,
  };
}

function candidate() {
  return makeFinalTargetCandidate({
    endpoint: 'http://127.0.0.1:3800',
    appId: 'com.example.app',
    session: {
      sessionId: 'sess-1',
      sourceIp: '10.0.0.8',
      connectionState: 'active',
      syncState: 'live',
      lastSeenAt: '2026-08-17T02:40:00.000Z',
      device: { platform: 'ios', model: 'iPhone 15' },
      observation: {
        matchedEventCount: 1,
        eventTimeRange: { since: '2026-08-17T02:32:00.000Z', until: '2026-08-17T02:32:00.000Z' },
        receivedTimeRange: { since: '2026-08-17T02:40:00.000Z', until: '2026-08-17T02:40:00.000Z' },
      },
    },
  }, createResumeState({ hub: 'http://127.0.0.1:3800', appId: 'com.example.app' })).candidate;
}

function expectValid(result) {
  expect(validateDiagnoseResult(result)).toEqual({ ok: true });
}

describe('materializeDiagnoseDecision capture loop', () => {
  it('walks no_app through four capture steps then NO_EVIDENCE', () => {
    let state = createResumeState({});
    const steps = [];
    for (let i = 0; i < 5; i += 1) {
      const { result, nextState } = materializeDiagnoseDecision({
        kind: 'fact',
        reasonCode: 'no_app',
      }, state);
      expectValid(result.result ? result.result : result);
      const payload = result.result || result;
      steps.push(payload);
      state = nextState;
    }
    expect(steps.slice(0, 4).map((item) => item.action.captureStep)).toEqual([
      'open_app', 'upload_once', 'start_live', 'reproduce_issue',
    ]);
    expect(steps.slice(0, 4).map((item) => item.action.attempt)).toEqual([1, 2, 3, 4]);
    expect(steps[4]).toMatchObject({ state: 'unavailable', code: 'NO_EVIDENCE' });
    expect(steps[4].error.attempted.map((item) => item.step)).toEqual([
      'open_app', 'upload_once', 'start_live', 'reproduce_issue',
    ]);
    for (const item of steps.slice(0, 4)) {
      expect(item.action.retryArgs).toContain('--resume-token');
    }
  });

  it('skips open_app as already_observed for empty_session', () => {
    let state = createResumeState({
      hub: 'http://127.0.0.1:3800',
      appId: 'com.example.app',
    });
    state = deriveResumeState(state, {
      select: { hub: 'http://127.0.0.1:3800', appId: 'com.example.app', sessionId: 'sess-1' },
    }).state;
    const first = materializeDiagnoseDecision({ kind: 'fact', reasonCode: 'empty_session' }, state);
    const payload = first.result.result || first.result;
    expectValid(payload);
    expect(payload.action).toMatchObject({
      captureStep: 'upload_once',
      attempt: 2,
      reasonCode: 'empty_session',
    });
    expect(first.nextState.capture.completed).toEqual([
      { step: 'open_app', outcome: 'already_observed' },
      { step: 'upload_once', outcome: 'requested' },
    ]);
    expect(first.nextState.attempts.CAPTURE_LOGS).toBe(2);
  });
});

describe('one-attempt actions', () => {
  it('emits ALLOW_STALE then INVALID_RESPONSE, with --allow-stale on retry argv', () => {
    const first = materializeDiagnoseDecision({
      kind: 'fact',
      reasonCode: 'only_stale',
    }, createResumeState({}));
    const payload = first.result.result || first.result;
    expectValid(payload);
    expect(payload).toMatchObject({
      state: 'action_required',
      code: 'ALLOW_STALE',
    });
    expect(payload.action.retryArgs).toContain('--allow-stale');
    expect(first.nextState.stale.allow).toBe(true);

    const second = materializeDiagnoseDecision({
      kind: 'fact',
      reasonCode: 'only_stale',
    }, first.nextState);
    const again = second.result.result || second.result;
    expectValid(again);
    expect(again).toMatchObject({ state: 'unavailable', code: 'INVALID_RESPONSE' });
  });

  it('emits CONFIRM_TIME with omitTime retry args and one replacement', () => {
    const cand = candidate();
    const first = materializeDiagnoseDecision({
      kind: 'fact',
      reasonCode: 'no_time_overlap',
      candidates: [cand],
      window: { sinceMs: NOW - 300000, untilMs: NOW + 300000, source: 'at' },
    }, createResumeState({ at: '2026-08-17T10:32:00+08:00' }));
    const payload = first.result.result || first.result;
    expectValid(payload);
    expect(payload.code).toBe('CONFIRM_TIME');
    expect(payload.action.retryArgs).not.toContain('--at');
    expect(payload.action.retryArgs).toContain('--resume-token');

    const token = payload.action.retryArgs[payload.action.retryArgs.lastIndexOf('--resume-token') + 1];
    const decoded = decodeResumeToken(token);
    expect(decoded.state.time.kind).toBe('at');

    const replaced = mergeResumeOptions(first.nextState, { at: '2026-08-17T11:00:00+08:00' });
    expect(replaced.ok).toBe(true);
    const second = mergeResumeOptions(replaced.state, { at: '2026-08-17T12:00:00+08:00' });
    expect(second.ok).toBe(false);

    const terminal = materializeDiagnoseDecision({
      kind: 'fact',
      reasonCode: 'no_time_overlap',
      candidates: [cand],
      window: { sinceMs: NOW - 300000, untilMs: NOW + 300000 },
    }, first.nextState);
    expect((terminal.result.result || terminal.result).code).toBe('TIME_UNRESOLVED');
  });

  it('maps terminal TARGET_AMBIGUOUS and invalid argv without a second CONFIRM_TARGET', () => {
    const terminal = materializeDiagnoseDecision({
      kind: 'terminal',
      code: 'TARGET_AMBIGUOUS',
      message: 'not unique',
      attempted: [{
        tokens: [{ contentTrust: 'untrusted', text: 'iphone', truncated: false }],
        matchCount: 2,
        totalTokenCount: 1,
        omittedTokenCount: 0,
      }],
    }, createResumeState({}));
    const payload = terminal.result.result || terminal.result;
    expectValid(payload);
    expect(payload).toMatchObject({ state: 'unavailable', code: 'TARGET_AMBIGUOUS' });
    expect(getDiagnoseExitCode(payload)).toBe(3);

    const invalid = materializeDiagnoseDecision({
      kind: 'invalid',
      message: 'bad iso',
      attempted: [{ field: 'at', message: 'bad iso' }],
    }, createResumeState({}));
    const inv = invalid.result.result || invalid.result;
    expectValid(inv);
    expect(inv).toMatchObject({ state: 'unavailable', code: 'INVALID_ARGUMENT' });
    expect(getDiagnoseExitCode(inv)).toBe(2);
  });

  it('keeps released Session capture under Hub/App', () => {
    let state = createResumeState({ hub: 'http://127.0.0.1:3800', appId: 'com.example.app' });
    state = deriveResumeState(state, {
      select: { hub: 'http://127.0.0.1:3800', appId: 'com.example.app', sessionId: 'sess-1' },
    }).state;
    state = deriveResumeState(state, { releaseSessionForCapture: MISSING_SESSION_AUTH }).state;
    const materialized = materializeDiagnoseDecision({
      kind: 'fact',
      reasonCode: 'no_session',
    }, state);
    const payload = materialized.result.result || materialized.result;
    expectValid(payload);
    expect(payload.action.reasonCode).toBe('no_session');
    expect(payload.action.retryArgs).not.toContain('--session');
    expect(materialized.nextState.selected.hub).toBe('http://127.0.0.1:3800');
    expect(materialized.nextState.selected.appId).toBe('com.example.app');
    expect(mergeResumeOptions(materialized.nextState, { session: 'sess-2' }).ok).toBe(false);
  });
});

describe('hub failures', () => {
  it('starts LOCAL_HUB_NOT_RUNNING then HUB_UNREACHABLE', () => {
    const first = materializeHubFailure({
      reasonCode: 'no_usable_implicit_hub',
      attempted: [hubAttempt()],
    }, createResumeState({}));
    const payload = first.result.result || first.result;
    expectValid(payload);
    expect(payload).toMatchObject({
      code: 'LOCAL_HUB_NOT_RUNNING',
    });
    expect(payload.action.suggestedCommand).toBe('npx --no-install debug-toolkit hub dev');

    const second = materializeHubFailure({
      reasonCode: 'no_usable_implicit_hub',
      attempted: [hubAttempt()],
    }, first.nextState);
    expect((second.result.result || second.result).code).toBe('HUB_UNREACHABLE');
  });

  it('starts CONNECT_HUB then HUB_UNREACHABLE for an explicit Hub', () => {
    const first = materializeHubFailure({
      reasonCode: 'explicit_hub_unreachable',
      attempted: [hubAttempt({ endpoint: 'http://10.0.0.2:3800' })],
    }, createResumeState({ hub: 'http://10.0.0.2:3800' }));
    const payload = first.result.result || first.result;
    expectValid(payload);
    expect(payload.code).toBe('CONNECT_HUB');
    const second = materializeHubFailure({
      reasonCode: 'explicit_hub_unreachable',
      attempted: [hubAttempt({ endpoint: 'http://10.0.0.2:3800' })],
    }, first.nextState);
    expect((second.result.result || second.result).code).toBe('HUB_UNREACHABLE');
  });
});
