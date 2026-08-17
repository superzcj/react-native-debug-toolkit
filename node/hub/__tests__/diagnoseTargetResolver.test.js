'use strict';

const { TIME_CLIP_MS } = require('../src/protocol/time');
const {
  createResumeState,
  deriveResumeState,
  decodeResumeToken,
} = require('../src/cli/diagnoseResumeToken');
const {
  parseDiagnoseTime,
  tokenizeTargetMatch,
  resolveDiagnoseTarget,
  escapeDisplayLabel,
} = require('../src/cli/diagnoseTargetResolver');

const NOW_MS = 1_786_934_400_000; // 2026-08-17T02:40:00.000Z
const AT_1032 = '2026-08-17T10:32:00+08:00';

function observation({ matched = 1, eventSince, eventUntil, nearest } = {}) {
  return {
    matchedEventCount: matched,
    eventTimeRange: eventSince && eventUntil
      ? { since: eventSince, until: eventUntil }
      : null,
    receivedTimeRange: eventSince && eventUntil
      ? { since: eventSince, until: eventUntil }
      : null,
    nearestEventTimestamp: nearest || eventUntil || null,
  };
}

function session(id, overrides = {}) {
  return {
    sessionId: id,
    sourceIp: '10.0.0.8',
    connectionState: 'active',
    syncState: 'live',
    lastSeenAt: '2026-08-17T02:40:00.000Z',
    device: { platform: 'ios', model: 'iPhone 15', appVersion: '4.0.0' },
    observation: observation({
      matched: 1,
      eventSince: '2026-08-17T02:32:00.000Z',
      eventUntil: '2026-08-17T02:32:00.000Z',
      nearest: '2026-08-17T02:32:00.000Z',
    }),
    ...overrides,
  };
}

function hub(endpoint, apps) {
  return { endpoint, ready: true, apps };
}

function app(appId, sessions) {
  return { appId, sessions };
}

describe('parseDiagnoseTime', () => {
  it('expands --at to ±5 minutes and keeps a full range', () => {
    const at = parseDiagnoseTime({ at: AT_1032 }, NOW_MS);
    expect(at).toMatchObject({
      ok: true,
      explicit: true,
      source: 'at',
      sinceMs: Date.parse('2026-08-17T02:27:00.000Z'),
      untilMs: Date.parse('2026-08-17T02:37:00.000Z'),
    });

    const range = parseDiagnoseTime({
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    }, NOW_MS);
    expect(range).toMatchObject({
      ok: true,
      explicit: true,
      source: 'range',
      sinceMs: Date.parse('2026-08-17T02:00:00.000Z'),
      untilMs: Date.parse('2026-08-17T03:00:00.000Z'),
    });

    expect(parseDiagnoseTime({}, NOW_MS)).toMatchObject({
      ok: true,
      explicit: false,
      source: 'default',
      sinceMs: NOW_MS - 600000,
      untilMs: NOW_MS,
    });
  });

  it('rejects combined, half, invalid, descending, and TimeClip-crossing windows', () => {
    expect(parseDiagnoseTime({
      at: AT_1032,
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    }, NOW_MS).ok).toBe(false);
    expect(parseDiagnoseTime({ since: '2026-08-17T02:00:00.000Z' }, NOW_MS).ok).toBe(false);
    expect(parseDiagnoseTime({ at: '08/17/2026' }, NOW_MS).ok).toBe(false);
    expect(parseDiagnoseTime({
      since: '2026-08-17T03:00:00.000Z',
      until: '2026-08-17T02:00:00.000Z',
    }, NOW_MS).ok).toBe(false);

    const boundary = new Date(TIME_CLIP_MS).toISOString();
    expect(parseDiagnoseTime({ at: boundary }, NOW_MS).ok).toBe(false);
  });
});

describe('resolveDiagnoseTarget precedence', () => {
  it('selects a unique implicit Hub/App/Session', () => {
    const result = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [
        app('com.example.app', [session('sess-1')]),
      ])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(result.kind).toBe('selected');
    expect(result.target.control).toMatchObject({
      hub: 'http://127.0.0.1:3800',
      appId: 'com.example.app',
      sessionId: 'sess-1',
    });
    expect(result.nextState.selected.sessionId).toBe('sess-1');
  });

  it('keeps an explicit Hub sticky and finds an App only on the project endpoint', () => {
    const hubs = [
      hub('http://127.0.0.1:3800', [app('com.other.app', [session('loop')])]),
      hub('http://10.0.0.2:3800', [app('com.example.app', [session('proj')])]),
    ];
    const sticky = resolveDiagnoseTarget({
      hubs,
      options: { hub: 'http://10.0.0.2:3800' },
      resumeState: createResumeState({ hub: 'http://10.0.0.2:3800' }),
      nowMs: NOW_MS,
    });
    expect(sticky.target.control.hub).toBe('http://10.0.0.2:3800');

    const byApp = resolveDiagnoseTarget({
      hubs,
      options: { appId: 'com.example.app' },
      resumeState: createResumeState({ appId: 'com.example.app' }),
      nowMs: NOW_MS,
    });
    expect(byApp.target.control).toMatchObject({
      hub: 'http://10.0.0.2:3800',
      sessionId: 'proj',
    });
  });

  it('prefers the Hub with a time-relevant Session and a stale crash over a restarted active Session', () => {
    const crashTime = observation({
      matched: 1,
      eventSince: '2026-08-17T02:32:00.000Z',
      eventUntil: '2026-08-17T02:32:00.000Z',
      nearest: '2026-08-17T02:32:00.000Z',
    });
    const emptyNow = observation({
      matched: 0,
      eventSince: '2026-08-17T02:40:00.000Z',
      eventUntil: '2026-08-17T02:40:00.000Z',
      nearest: '2026-08-17T02:40:00.000Z',
    });
    const result = resolveDiagnoseTarget({
      hubs: [
        hub('http://127.0.0.1:3800', [app('com.example.app', [
          session('active-new', { connectionState: 'active', observation: emptyNow }),
        ])]),
        hub('http://10.0.0.2:3800', [app('com.example.app', [
          session('stale-crash', { connectionState: 'stale', observation: crashTime }),
        ])]),
      ],
      options: { at: AT_1032 },
      resumeState: createResumeState({ at: AT_1032 }),
      nowMs: NOW_MS,
    });
    expect(result.kind).toBe('selected');
    expect(result.target.control.sessionId).toBe('stale-crash');
    expect(result.window.source).toBe('intersection');
    expect(result.window.sinceMs).toBe(Date.parse('2026-08-17T02:32:00.000Z'));
  });

  it('handles active vs stale, prefer-stale, allow-stale, and only_stale', () => {
    const stale = session('stale-1', { connectionState: 'stale' });
    const active = session('active-1', { connectionState: 'active' });
    const hubs = [hub('http://127.0.0.1:3800', [app('com.example.app', [stale, active])])];

    const preferActive = resolveDiagnoseTarget({
      hubs,
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(preferActive.target.control.sessionId).toBe('active-1');

    const preferStale = resolveDiagnoseTarget({
      hubs,
      options: { preferStale: true },
      resumeState: createResumeState({ preferStale: true }),
      nowMs: NOW_MS,
    });
    expect(preferStale.target.control.sessionId).toBe('stale-1');

    const onlyStaleHubs = [hub('http://127.0.0.1:3800', [app('com.example.app', [stale])])];
    expect(resolveDiagnoseTarget({
      hubs: onlyStaleHubs,
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    }).reasonCode).toBe('only_stale');

    expect(resolveDiagnoseTarget({
      hubs: onlyStaleHubs,
      options: { allowStale: true },
      resumeState: createResumeState({ allowStale: true }),
      nowMs: NOW_MS,
    }).target.control.sessionId).toBe('stale-1');
  });

  it('requires explicit Session ownership and reports empty_session / no_time_overlap / no_app / no_session', () => {
    expect(resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', [session('sess-1')])])],
      options: { appId: 'com.example.app', session: 'missing' },
      resumeState: createResumeState({ appId: 'com.example.app', session: 'missing' }),
      nowMs: NOW_MS,
    }).reasonCode).toBe('no_session');

    expect(resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    }).reasonCode).toBe('no_app');

    expect(resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', [])])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    }).reasonCode).toBe('no_session');

    const emptyObs = { matchedEventCount: 0, eventTimeRange: null, receivedTimeRange: null, nearestEventTimestamp: null };
    expect(resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', [
        session('empty', { observation: emptyObs }),
      ])])],
      options: { at: AT_1032 },
      resumeState: createResumeState({ at: AT_1032 }),
      nowMs: NOW_MS,
    }).reasonCode).toBe('empty_session');

    const elsewhere = observation({
      matched: 0,
      eventSince: '2026-08-17T01:00:00.000Z',
      eventUntil: '2026-08-17T01:00:00.000Z',
      nearest: '2026-08-17T01:00:00.000Z',
    });
    const overlap = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', [
        session('old', { observation: elsewhere }),
      ])])],
      options: { at: AT_1032 },
      resumeState: createResumeState({ at: AT_1032 }),
      nowMs: NOW_MS,
    });
    expect(overlap.reasonCode).toBe('no_time_overlap');
    expect(overlap.candidates).toHaveLength(1);
  });

  it('keeps an explicit Session+time with zero matches and retains the requested window', () => {
    const emptyWindow = observation({
      matched: 0,
      eventSince: '2026-08-17T02:00:00.000Z',
      eventUntil: '2026-08-17T02:10:00.000Z',
      nearest: '2026-08-17T02:00:00.000Z',
    });
    const result = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', [
        session('sess-1', { observation: emptyWindow }),
      ])])],
      options: {
        appId: 'com.example.app',
        session: 'sess-1',
        at: AT_1032,
      },
      resumeState: createResumeState({
        appId: 'com.example.app',
        session: 'sess-1',
        at: AT_1032,
      }),
      nowMs: NOW_MS,
    });
    expect(result.kind).toBe('selected');
    expect(result.window.sinceMs).toBe(Date.parse('2026-08-17T02:27:00.000Z'));
    expect(result.window.untilMs).toBe(Date.parse('2026-08-17T02:37:00.000Z'));
    expect(result.window.source).toBe('at');
  });
});

describe('bounded candidates and literal target match', () => {
  function manySessions(count) {
    return Array.from({ length: count }, (_, i) => session(`sess-${String(i + 1).padStart(2, '0')}`, {
      lastSeenAt: new Date(NOW_MS - i * 1000).toISOString(),
    }));
  }

  it('returns selection at 2 and 20, and CONFIRM_TARGET at 21', () => {
    const two = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', manySessions(2))])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(two).toMatchObject({ kind: 'selection', total: 2 });

    const twenty = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', manySessions(20))])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(twenty.kind).toBe('selection');
    expect(twenty.total).toBe(20);

    const twentyOne = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', manySessions(21))])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(twentyOne.kind).toBe('fact');
    expect(twentyOne.reasonCode).toBe('candidate_budget_exceeded');
    expect(twentyOne.examples.length).toBeLessThanOrEqual(5);
    for (const values of Object.values(twentyOne.facets)) {
      expect(values.length).toBeLessThanOrEqual(8);
    }
  });

  it('tokenizes hostile text literally and AND-matches', () => {
    const text = 'iPhone 15 "$(touch x)"; .* ；';
    expect(tokenizeTargetMatch(text)).toEqual(expect.arrayContaining(['iphone', '15', 'touch', 'x']));
    expect(escapeDisplayLabel('<b>x</b>')).toContain('&lt;');

    const hubs = [hub('http://127.0.0.1:3800', [app('com.example.app', [
      session('a', { device: { platform: 'ios', model: 'iPhone 15', appVersion: '4.0.0' } }),
      session('b', { device: { platform: 'android', model: 'Pixel', appVersion: '4.0.0' } }),
    ])])];
    const one = resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: 'iPhone 15' },
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(one.kind).toBe('selected');
    expect(one.target.control.sessionId).toBe('a');

    const hostile = resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: 'iPhone 15 "$(touch x)";' },
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(hostile.kind).toBe('terminal');
    expect(hostile.code).toBe('TARGET_AMBIGUOUS');
  });

  it('returns TARGET_AMBIGUOUS with bounded token metadata, and INVALID_ARGUMENT for oversized input', () => {
    const hubs = [hub('http://127.0.0.1:3800', [app('com.example.app', [
      session('a'),
      session('b'),
    ])])];
    let state = createResumeState({});
    state = deriveResumeState(state, { incrementAction: 'CONFIRM_TARGET' }).state;
    state.targetConfirmationUsed = true;

    const zero = resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: 'nokia' },
      resumeState: state,
      nowMs: NOW_MS,
    });
    expect(zero).toMatchObject({ kind: 'terminal', code: 'TARGET_AMBIGUOUS' });
    expect(zero.attempted[0].matchCount).toBe(0);

    const nine = Array.from({ length: 9 }, (_, i) => `tok${i}`).join(' ');
    const nineResult = resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: nine },
      resumeState: state,
      nowMs: NOW_MS,
    });
    expect(nineResult.kind).toBe('terminal');
    expect(nineResult.attempted[0].tokens).toHaveLength(8);
    expect(nineResult.attempted[0].omittedTokenCount).toBe(1);

    const longToken = `iphone ${'z'.repeat(65)}`;
    const longResult = resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: longToken },
      resumeState: state,
      nowMs: NOW_MS,
    });
    expect(longResult.kind).toBe('terminal');
    expect(longResult.attempted[0].tokens[1].truncated).toBe(true);
    expect(longResult.attempted[0].tokens[1].text).toHaveLength(64);

    expect(resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: 'x'.repeat(513) },
      resumeState: state,
      nowMs: NOW_MS,
    }).kind).toBe('invalid');
    expect(resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: Array.from({ length: 33 }, (_, i) => `t${i}`).join(' ') },
      resumeState: state,
      nowMs: NOW_MS,
    }).kind).toBe('invalid');
    expect(resolveDiagnoseTarget({
      hubs,
      options: { targetMatch: `ok ${'y'.repeat(129)}` },
      resumeState: state,
      nowMs: NOW_MS,
    }).kind).toBe('invalid');
  });

  it('after CONFIRM_TARGET, applies a new --at then literal device match', () => {
    const sessions = Array.from({ length: 21 }, (_, i) => session(`sess-${i + 1}`, {
      device: { platform: 'ios', model: 'iPhone 15', appVersion: '4.0.0' },
      observation: observation({
        matched: i === 0 ? 1 : 0,
        eventSince: i === 0 ? '2026-08-17T02:32:00.000Z' : '2026-08-17T01:00:00.000Z',
        eventUntil: i === 0 ? '2026-08-17T02:32:00.000Z' : '2026-08-17T01:00:00.000Z',
        nearest: i === 0 ? '2026-08-17T02:32:00.000Z' : '2026-08-17T01:00:00.000Z',
      }),
    }));
    let state = createResumeState({});
    state = deriveResumeState(state, { incrementAction: 'CONFIRM_TARGET' }).state;
    const merged = require('../src/cli/diagnoseResumeToken').mergeResumeOptions(state, {
      targetMatch: 'iPhone 15',
      at: AT_1032,
    });
    expect(merged.ok).toBe(true);
    const result = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', sessions)])],
      options: { targetMatch: 'iPhone 15', at: AT_1032 },
      resumeState: merged.state,
      nowMs: NOW_MS,
    });
    expect(result.kind).toBe('selected');
    expect(result.target.control.sessionId).toBe('sess-1');

    const explicit = createResumeState({
      since: '2026-08-17T02:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    });
    const afterConfirm = deriveResumeState(explicit, { incrementAction: 'CONFIRM_TARGET' }).state;
    const widened = require('../src/cli/diagnoseResumeToken').mergeResumeOptions(afterConfirm, {
      targetMatch: 'iPhone',
      since: '2026-08-17T01:00:00.000Z',
      until: '2026-08-17T03:00:00.000Z',
    });
    expect(widened.ok).toBe(false);
  });

  it('stores selected Hub/App/Session only in trusted resumeArgs', () => {
    const result = resolveDiagnoseTarget({
      hubs: [hub('http://127.0.0.1:3800', [app('com.example.app', [
        session('sess-1'),
        session('sess-2'),
      ])])],
      options: {},
      resumeState: createResumeState({}),
      nowMs: NOW_MS,
    });
    expect(result.kind).toBe('selection');
    for (const candidate of result.candidates) {
      const token = candidate.control.resumeArgs[candidate.control.resumeArgs.lastIndexOf('--resume-token') + 1];
      const decoded = decodeResumeToken(token);
      expect(decoded.ok).toBe(true);
      expect(decoded.state.selected).toEqual({
        hub: candidate.control.hub,
        appId: candidate.control.appId,
        sessionId: candidate.control.sessionId,
      });
      expect(candidate.control.resumeArgs.join(' ')).not.toContain('iPhone');
    }
  });
});
