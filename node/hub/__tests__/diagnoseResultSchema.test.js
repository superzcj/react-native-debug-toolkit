'use strict';

const {
  validateDiagnoseResult,
  getDiagnoseExitCode,
  finalizeDiagnoseResult,
  formatDiagnoseContractHelp,
  DIAGNOSE_DEFINITIONS,
  ACTION_DEFS,
  UNAVAILABLE_DEFS,
  STATE_DEFS,
  CAPTURE_STEPS,
  LOCAL_HUB_SUGGESTED_COMMAND,
} = require('../src/cli/diagnoseResultSchema');
const {
  createResumeState,
  deriveResumeState,
  buildResumeArgs,
} = require('../src/cli/diagnoseResumeToken');

function makeRetryArgs(purposeCode = 'ALLOW_STALE') {
  let state = createResumeState({
    hub: 'http://127.0.0.1:3800',
    appId: 'com.example.app',
    at: '2026-08-17T10:32:00+08:00',
  });
  state = deriveResumeState(state, {
    select: {
      hub: 'http://127.0.0.1:3800',
      appId: 'com.example.app',
      sessionId: 'sess-1',
    },
  }).state;
  const omitTime = purposeCode === 'CONFIRM_TIME' || purposeCode === 'CONFIRM_TARGET';
  return buildResumeArgs(state, { omitTime });
}

const RETRY = makeRetryArgs('ALLOW_STALE');
const RETRY_OMIT_TIME = makeRetryArgs('CONFIRM_TIME');

function hubAttempt(overrides = {}) {
  return {
    endpoint: 'http://127.0.0.1:3800',
    phase: 'probe',
    kind: 'ready',
    code: 'OK',
    httpStatus: 200,
    appId: null,
    appCount: 0,
    pageCount: 0,
    sessionCount: 0,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  const base = {
    control: {
      contentTrust: 'trusted-control',
      hub: 'http://127.0.0.1:3800',
      appId: 'com.example.app',
      sessionId: 'sess-1',
      sourceIp: '10.0.0.2',
      connectionState: 'active',
      syncState: 'live',
      lastSeenAt: '2026-08-17T02:32:00.000Z',
      resumeArgs: makeRetryArgs('TARGET_SELECTION_REQUIRED'),
    },
    observed: {
      contentTrust: 'untrusted-structured',
      eventTimeRange: {
        since: '2026-08-17T02:30:00.000Z',
        until: '2026-08-17T02:35:00.000Z',
      },
      receivedTimeRange: {
        since: '2026-08-17T02:40:00.000Z',
        until: '2026-08-17T02:40:00.000Z',
      },
      matchedEventCount: 1,
    },
    device: {
      contentTrust: 'untrusted',
      platform: 'ios',
      model: 'iPhone 15',
    },
    label: { contentTrust: 'untrusted', text: 'iPhone 15 / com.example.app' },
  };
  return {
    ...base,
    ...overrides,
    control: { ...base.control, ...(overrides.control || {}) },
    observed: { ...base.observed, ...(overrides.observed || {}) },
    device: { ...base.device, ...(overrides.device || {}) },
    label: { ...base.label, ...(overrides.label || {}) },
  };
}

function contextEvent(overrides = {}) {
  return {
    entryId: 'e1',
    type: 'console',
    timestamp: 1_786_934_000_000,
    receivedAt: '2026-08-17T02:40:00.000Z',
    data: { message: 'hello' },
    preview: { contentTrust: 'trusted-control', isPreview: false, entryId: null },
    ...overrides,
  };
}

function evidenceReady(overrides = {}) {
  const events = overrides.events || [contextEvent()];
  const previewed = events.filter((event) => event.preview?.isPreview).length;
  const totalByType = {};
  for (const event of events) {
    totalByType[event.type] = (totalByType[event.type] || 0) + 1;
  }
  const observedTypes = Object.keys(totalByType).sort();
  const matched = overrides.matched != null ? overrides.matched : events.length;
  const omitted = overrides.omitted != null ? overrides.omitted : 0;
  const warnings = overrides.warnings || [];
  return {
    schemaVersion: 1,
    state: 'evidence_ready',
    code: null,
    target: candidate(),
    session: {
      connectionState: 'active',
      syncState: 'live',
      warnings,
    },
    window: {
      since: '2026-08-17T02:27:00.000Z',
      until: '2026-08-17T02:37:00.000Z',
      timeBasis: 'event',
    },
    context: {
      contentTrust: 'untrusted',
      events,
    },
    completeness: {
      matched,
      selected: events.length,
      omitted,
      previewed,
      observedTypes,
      totalByType,
      syncState: 'live',
      connectionState: 'active',
      warnings,
      ranges: {
        event: {
          since: '2026-08-17T02:30:00.000Z',
          until: '2026-08-17T02:35:00.000Z',
        },
        received: {
          since: '2026-08-17T02:40:00.000Z',
          until: '2026-08-17T02:40:00.000Z',
        },
      },
    },
    ...overrides,
  };
}

function zeroMatchEvidence() {
  return {
    schemaVersion: 1,
    state: 'evidence_ready',
    code: null,
    target: candidate({
      observed: {
        contentTrust: 'untrusted-structured',
        eventTimeRange: null,
        receivedTimeRange: null,
        matchedEventCount: 0,
      },
    }),
    session: { connectionState: 'active', syncState: 'live', warnings: [] },
    window: {
      since: '2026-08-17T03:00:00.000Z',
      until: '2026-08-17T03:10:00.000Z',
      timeBasis: 'event',
    },
    context: { contentTrust: 'untrusted', events: [] },
    completeness: {
      matched: 0,
      selected: 0,
      omitted: 0,
      previewed: 0,
      observedTypes: [],
      totalByType: {},
      syncState: 'live',
      connectionState: 'active',
      warnings: [],
      ranges: { event: null, received: null },
    },
  };
}

function selectionRequired(count = 2) {
  const candidates = Array.from({ length: count }, (_, i) => candidate({
    control: {
      contentTrust: 'trusted-control',
      hub: 'http://127.0.0.1:3800',
      appId: 'com.example.app',
      sessionId: `sess-${i + 1}`,
      sourceIp: '10.0.0.2',
      connectionState: 'active',
      syncState: 'live',
      lastSeenAt: '2026-08-17T02:32:00.000Z',
      resumeArgs: makeRetryArgs('TARGET_SELECTION_REQUIRED'),
    },
    label: { contentTrust: 'untrusted', text: `device ${i + 1}` },
  }));
  return {
    schemaVersion: 1,
    state: 'selection_required',
    code: 'TARGET_SELECTION_REQUIRED',
    selection: { candidates, total: candidates.length },
  };
}

function actionRequired(code, actionOverrides = {}) {
  const def = ACTION_DEFS[code];
  const baseAction = {
    actor: def.actor,
    reasonCode: def.reasons[0],
    attempt: 1,
    maxAttempts: def.maxAttempts,
    retryArgs: (code === 'CONFIRM_TIME' || code === 'CONFIRM_TARGET')
      ? [...RETRY_OMIT_TIME]
      : [...RETRY],
  };
  if (code === 'LOCAL_HUB_NOT_RUNNING') {
    Object.assign(baseAction, {
      suggestedCommand: LOCAL_HUB_SUGGESTED_COMMAND,
      attempted: [hubAttempt()],
    });
  }
  if (code === 'CAPTURE_LOGS') {
    Object.assign(baseAction, {
      reasonCode: 'empty_session',
      captureStep: 'upload_once',
      attempt: 2,
      maxAttempts: 4,
    });
  }
  if (code === 'CONFIRM_TIME') {
    baseAction.candidates = [candidate()];
  }
  if (code === 'CONFIRM_TARGET') {
    Object.assign(baseAction, {
      facets: {
        platform: [{ contentTrust: 'untrusted', text: 'ios', count: 3 }],
      },
      examples: [candidate()],
    });
  }
  if (code === 'CONNECT_HUB') {
    baseAction.attempted = [hubAttempt({ code: 'ECONNREFUSED', httpStatus: null })];
  }
  return {
    schemaVersion: 1,
    state: 'action_required',
    code,
    action: { ...baseAction, ...actionOverrides },
  };
}

function unavailable(code, attempted) {
  return {
    schemaVersion: 1,
    state: 'unavailable',
    code,
    error: {
      message: `blocked:${code}`,
      attempted,
    },
  };
}

function captureAttempted(outcomes = ['requested', 'requested', 'requested', 'requested']) {
  return CAPTURE_STEPS.map((step, index) => ({ step, outcome: outcomes[index] }));
}

describe('diagnoseResultSchema legal contract', () => {
  it('exports frozen definition tables', () => {
    expect(DIAGNOSE_DEFINITIONS.ACTION_DEFS).toBe(ACTION_DEFS);
    expect(Object.keys(ACTION_DEFS)).toEqual([
      'LOCAL_HUB_NOT_RUNNING',
      'CAPTURE_LOGS',
      'ALLOW_STALE',
      'CONFIRM_TIME',
      'CONFIRM_TARGET',
      'CONNECT_HUB',
    ]);
    expect(Object.keys(UNAVAILABLE_DEFS)).toHaveLength(7);
    expect(STATE_DEFS.evidence_ready).toEqual({ code: null, exitCode: 0 });
  });

  it('accepts evidence_ready with code null and exit 0', () => {
    const result = evidenceReady();
    expect(validateDiagnoseResult(result)).toEqual({ ok: true });
    expect(getDiagnoseExitCode(result)).toBe(0);
  });

  it('accepts selection_required with TARGET_SELECTION_REQUIRED', () => {
    const result = selectionRequired(2);
    expect(validateDiagnoseResult(result)).toEqual({ ok: true });
    expect(getDiagnoseExitCode(result)).toBe(0);
  });

  it.each(Object.keys(ACTION_DEFS))('accepts action_required/%s with exact actor/reason', (code) => {
    const result = actionRequired(code);
    expect(validateDiagnoseResult(result)).toEqual({ ok: true });
    expect(getDiagnoseExitCode(result)).toBe(0);
  });

  it('accepts CAPTURE_LOGS upload_once/2 sample from the plan', () => {
    const action = {
      schemaVersion: 1,
      state: 'action_required',
      code: 'CAPTURE_LOGS',
      action: {
        actor: 'user-required',
        reasonCode: 'empty_session',
        captureStep: 'upload_once',
        attempt: 2,
        maxAttempts: 4,
        retryArgs: [...RETRY],
      },
    };
    expect(validateDiagnoseResult(action)).toEqual({ ok: true });
    expect(getDiagnoseExitCode(action)).toBe(0);
  });

  it('rejects illegal continuation argv shapes on retryArgs', () => {
    const bad = actionRequired('ALLOW_STALE', {
      retryArgs: ['sh', '-c', 'echo no'],
    });
    expect(validateDiagnoseResult(bad).ok).toBe(false);

    const dup = actionRequired('ALLOW_STALE', {
      retryArgs: [...RETRY, '--hub', 'http://127.0.0.1:3800'],
    });
    expect(validateDiagnoseResult(dup).ok).toBe(false);
  });

  it('accepts all unavailable codes with contract exit codes', () => {
    const cases = [
      ['INVALID_ARGUMENT', [{ field: 'at', message: 'invalid ISO' }], 2],
      ['NO_EVIDENCE', captureAttempted(), 3],
      ['TARGET_AMBIGUOUS', [{
        tokens: [{ contentTrust: 'untrusted', text: 'iphone', truncated: false }],
        matchCount: 2,
        totalTokenCount: 1,
        omittedTokenCount: 0,
      }], 3],
      ['TIME_UNRESOLVED', [{
        window: { since: '2026-08-17T02:00:00.000Z', until: '2026-08-17T03:00:00.000Z' },
        candidateCount: 0,
      }], 3],
      ['HUB_UNREACHABLE', [hubAttempt({ code: 'ECONNREFUSED', httpStatus: null })], 4],
      ['PROTOCOL_MISMATCH', [hubAttempt({ code: 'PROTOCOL_MISMATCH', httpStatus: 200 })], 4],
      ['INVALID_RESPONSE', [], 5],
    ];
    for (const [code, attempted, exitCode] of cases) {
      const result = unavailable(code, attempted);
      expect(validateDiagnoseResult(result)).toEqual({ ok: true });
      expect(getDiagnoseExitCode(result)).toBe(exitCode);
    }
  });

  it('accepts explicit-time zero-match evidence', () => {
    expect(validateDiagnoseResult(zeroMatchEvidence())).toEqual({ ok: true });
  });
});

describe('diagnoseResultSchema rejections and help', () => {
  it('rejects unknown state and evidence with non-null code', () => {
    expect(validateDiagnoseResult({
      schemaVersion: 1,
      state: 'waiting',
      code: null,
    }).ok).toBe(false);
    expect(validateDiagnoseResult(evidenceReady({ code: 'NO_EVIDENCE' })).ok).toBe(false);
  });

  it('rejects empty completeness and inconsistent evidence arithmetic', () => {
    expect(validateDiagnoseResult(evidenceReady({
      completeness: {},
    })).ok).toBe(false);

    const badMath = evidenceReady();
    badMath.completeness.matched = 99;
    expect(validateDiagnoseResult(badMath).ok).toBe(false);

    const badPreview = evidenceReady({
      events: [contextEvent({
        preview: { contentTrust: 'trusted-control', isPreview: true, entryId: 'e1' },
      })],
    });
    badPreview.completeness.previewed = 0;
    expect(validateDiagnoseResult(badPreview).ok).toBe(false);
  });

  it('rejects more than 200 context events', () => {
    const events = Array.from({ length: 201 }, (_, i) => contextEvent({
      entryId: `e${i}`,
      type: 'console',
    }));
    const totalByType = { console: 201 };
    expect(validateDiagnoseResult(evidenceReady({
      events,
      matched: 201,
      omitted: 0,
      completeness: undefined,
    })).ok).toBe(false);
    // rebuild properly then assert length alone fails
    const over = evidenceReady();
    over.context.events = events;
    over.completeness.selected = 201;
    over.completeness.matched = 201;
    over.completeness.observedTypes = ['console'];
    over.completeness.totalByType = totalByType;
    expect(validateDiagnoseResult(over).ok).toBe(false);
  });

  it('rejects invalid selection shapes', () => {
    expect(validateDiagnoseResult({
      ...selectionRequired(2),
      code: 'CONFIRM_TARGET',
    }).ok).toBe(false);
    expect(validateDiagnoseResult(selectionRequired(1)).ok).toBe(false);
    expect(validateDiagnoseResult(selectionRequired(21)).ok).toBe(false);
    const mismatch = selectionRequired(2);
    mismatch.selection.total = 3;
    expect(validateDiagnoseResult(mismatch).ok).toBe(false);
  });

  it('rejects CAPTURE_LOGS actor/reason/attempt/step mistakes', () => {
    expect(validateDiagnoseResult(actionRequired('CAPTURE_LOGS', {
      actor: 'agent-capable',
    })).ok).toBe(false);
    expect(validateDiagnoseResult(actionRequired('CAPTURE_LOGS', {
      reasonCode: 'only_stale',
    })).ok).toBe(false);
    expect(validateDiagnoseResult(actionRequired('CAPTURE_LOGS', {
      attempt: 0,
      captureStep: 'open_app',
    })).ok).toBe(false);
    expect(validateDiagnoseResult(actionRequired('CAPTURE_LOGS', {
      captureStep: 'open_app',
      attempt: 2,
    })).ok).toBe(false);
    const missingRetry = actionRequired('CAPTURE_LOGS');
    delete missingRetry.action.retryArgs;
    expect(validateDiagnoseResult(missingRetry).ok).toBe(false);
  });

  it('rejects nonliteral local Hub suggestion and over-budget facets/examples', () => {
    expect(validateDiagnoseResult(actionRequired('LOCAL_HUB_NOT_RUNNING', {
      suggestedCommand: 'npm start',
    })).ok).toBe(false);

    const facets = actionRequired('CONFIRM_TARGET', {
      facets: {
        platform: Array.from({ length: 9 }, (_, i) => ({
          contentTrust: 'untrusted',
          text: `p${i}`,
          count: 1,
        })),
      },
    });
    expect(validateDiagnoseResult(facets).ok).toBe(false);

    const examples = actionRequired('CONFIRM_TARGET', {
      examples: Array.from({ length: 6 }, () => candidate()),
    });
    expect(validateDiagnoseResult(examples).ok).toBe(false);
  });

  it('rejects wrong-kind and over-budget attempted payloads', () => {
    expect(validateDiagnoseResult(unavailable('NO_EVIDENCE', captureAttempted().slice(0, 3))).ok).toBe(false);
    expect(validateDiagnoseResult(unavailable('NO_EVIDENCE', [
      { step: 'upload_once', outcome: 'requested' },
      { step: 'open_app', outcome: 'requested' },
      { step: 'start_live', outcome: 'requested' },
      { step: 'reproduce_issue', outcome: 'requested' },
    ])).ok).toBe(false);
    expect(validateDiagnoseResult(unavailable('NO_EVIDENCE', [
      { step: 'open_app', outcome: 'requested' },
      { step: 'open_app', outcome: 'requested' },
      { step: 'start_live', outcome: 'requested' },
      { step: 'reproduce_issue', outcome: 'requested' },
    ])).ok).toBe(false);

    expect(validateDiagnoseResult(unavailable('TARGET_AMBIGUOUS', [{
      tokens: [{ contentTrust: 'untrusted', text: 'a', truncated: false }],
      matchCount: 1,
      totalTokenCount: 1,
      omittedTokenCount: 0,
    }])).ok).toBe(false);

    expect(validateDiagnoseResult(unavailable('TARGET_AMBIGUOUS', [{
      tokens: [{ contentTrust: 'untrusted', text: 'a', truncated: false }],
      matchCount: 0,
      totalTokenCount: 2,
      omittedTokenCount: 0,
    }])).ok).toBe(false);

    expect(validateDiagnoseResult(unavailable('HUB_UNREACHABLE', [
      hubAttempt({ body: 'raw' }),
    ])).ok).toBe(false);

    expect(validateDiagnoseResult(unavailable('HUB_UNREACHABLE', Array.from({ length: 13 }, () => hubAttempt()))).ok)
      .toBe(false);

    const withRetry = unavailable('NO_EVIDENCE', captureAttempted());
    withRetry.retryArgs = [...RETRY];
    expect(validateDiagnoseResult(withRetry).ok).toBe(false);
  });

  it('rejects raw dump fields on results', () => {
    const dump = evidenceReady();
    dump.apps = [{ id: 'x' }];
    expect(validateDiagnoseResult(dump).ok).toBe(false);
  });

  it('finalizeDiagnoseResult wraps invalid candidates as INVALID_RESPONSE', () => {
    const finalized = finalizeDiagnoseResult({ schemaVersion: 1, state: 'waiting' });
    expect(finalized.result).toMatchObject({
      state: 'unavailable',
      code: 'INVALID_RESPONSE',
    });
    expect(finalized.exitCode).toBe(5);
  });

  it('formatDiagnoseContractHelp lists every state/code and exit codes', () => {
    const help = formatDiagnoseContractHelp();
    for (const state of Object.keys(STATE_DEFS)) {
      expect(help).toContain(state);
    }
    for (const code of Object.keys(ACTION_DEFS)) {
      expect(help).toContain(code);
    }
    for (const [code, def] of Object.entries(UNAVAILABLE_DEFS)) {
      expect(help).toContain(code);
      expect(help).toContain(String(def.exitCode));
    }
  });
});
