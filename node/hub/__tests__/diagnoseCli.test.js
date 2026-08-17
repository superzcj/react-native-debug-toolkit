'use strict';

const { HubReadError } = require('../src/cli/httpClient');
const { diagnoseCommand, windowToHttpQuery } = require('../src/cli/commands/diagnose');
const { validateDiagnoseResult, getDiagnoseExitCode } = require('../src/cli/diagnoseResultSchema');
const {
  decodeResumeToken,
  encodeResumeToken,
  createResumeState,
  deriveResumeState,
} = require('../src/cli/diagnoseResumeToken');

const NOW = 1_786_934_400_000;
const LOCAL = 'http://127.0.0.1:3800';
const REMOTE = 'http://10.0.0.2:3800';
const AT_1032 = '2026-08-17T10:32:00+08:00';

function observation(overrides = {}) {
  return {
    matchedEventCount: 1,
    eventTimeRange: { since: '2026-08-17T02:32:00.000Z', until: '2026-08-17T02:32:00.000Z' },
    receivedTimeRange: { since: '2026-08-17T02:40:00.000Z', until: '2026-08-17T02:40:00.000Z' },
    nearestEventTimestamp: '2026-08-17T02:32:00.000Z',
    ...overrides,
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
    observation: observation(),
    ...overrides,
  };
}

function probe(endpoint, kind, extra = {}) {
  const apps = extra.apps || [];
  let httpStatus = null;
  let payload = null;
  if (kind === 'compatible') {
    httpStatus = 200;
    payload = {
      ok: true,
      name: 'react-native-debug-toolkit-hub',
      protocolVersion: 1,
      apps,
    };
  } else if (kind === 'incompatible') {
    httpStatus = 200;
    payload = { ok: true, name: 'other-hub', protocolVersion: 99, apps };
  } else if (kind === 'not_ready') {
    httpStatus = 503;
    payload = { ok: false, error: { code: 'HUB_NOT_READY' } };
  }
  return {
    endpoint,
    kind,
    httpStatus,
    payload,
    error: kind === 'unreachable' ? 'ECONNREFUSED' : null,
  };
}

function discovered(results, explicit = false) {
  return {
    explicit,
    attempted: results.map((item) => item.endpoint),
    results,
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

function okContext(overrides = {}) {
  const events = overrides.events || [contextEvent()];
  const omitted = overrides.omitted != null ? overrides.omitted : 0;
  const matched = overrides.matched != null ? overrides.matched : events.length + omitted;
  const previewed = events.filter((event) => event.preview?.isPreview).length;
  const totalByType = {};
  for (const event of events) {
    totalByType[event.type] = (totalByType[event.type] || 0) + 1;
  }
  const observedTypes = Object.keys(totalByType).sort();
  return {
    ok: true,
    connectionState: 'active',
    syncState: 'live',
    events,
    window: {
      since: '2026-08-17T02:30:00.000Z',
      until: '2026-08-17T02:40:00.000Z',
      timeBasis: 'event',
    },
    ranges: {
      event: { since: '2026-08-17T02:32:00.000Z', until: '2026-08-17T02:32:00.000Z' },
      received: { since: '2026-08-17T02:40:00.000Z', until: '2026-08-17T02:40:00.000Z' },
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
      warnings: [],
    },
    ...overrides,
  };
}

function tokenFromArgs(args) {
  const index = args.lastIndexOf('--resume-token');
  return args[index + 1];
}

function flagValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

function optionsFromArgv(args, extra = {}) {
  const options = {
    hub: flagValue(args, '--hub'),
    endpoint: flagValue(args, '--endpoint'),
    appId: flagValue(args, '--app-id'),
    session: flagValue(args, '--session'),
    at: flagValue(args, '--at'),
    since: flagValue(args, '--since'),
    until: flagValue(args, '--until'),
    allowStale: args.includes('--allow-stale'),
    preferStale: args.includes('--prefer-stale'),
    resumeToken: tokenFromArgs(args),
    ...extra,
  };
  return options;
}

function expectValid(result) {
  const validation = validateDiagnoseResult(result);
  if (!validation.ok) {
    throw new Error(validation.errors.join('; '));
  }
}

async function run(options, deps) {
  const { result, exitCode } = await diagnoseCommand(options, {
    now: () => NOW,
    ...deps,
  });
  expectValid(result);
  expect(exitCode).toBe(getDiagnoseExitCode(result));
  return result;
}

describe('windowToHttpQuery', () => {
  it('emits ISO bounds and never epoch-number strings', () => {
    const query = windowToHttpQuery({ sinceMs: NOW - 600000, untilMs: NOW });
    expect(query).toEqual({
      since: '2026-08-17T02:30:00.000Z',
      until: '2026-08-17T02:40:00.000Z',
      timeBasis: 'event',
    });
    expect(query.since.includes('T')).toBe(true);
    expect(Number.isNaN(Number(query.since))).toBe(true);
  });
});

describe('diagnoseCommand hub discovery', () => {
  it('returns LOCAL_HUB_NOT_RUNNING after every implicit probe finishes', async () => {
    const calls = [];
    const result = await run({}, {
      resolveCliHubCandidates: async () => {
        calls.push('start');
        const payload = discovered([
          probe(LOCAL, 'unreachable'),
          probe('http://10.0.0.9:3800', 'not_ready'),
        ]);
        calls.push('done');
        return payload;
      },
      listAllSessions: async () => {
        throw new Error('sessions should not run');
      },
      readContext: async () => {
        throw new Error('context should not run');
      },
    });
    expect(calls).toEqual(['start', 'done']);
    expect(result).toMatchObject({
      state: 'action_required',
      code: 'LOCAL_HUB_NOT_RUNNING',
      action: { reasonCode: 'no_usable_implicit_hub' },
    });
    expect(result.action.suggestedCommand).toBe('npx --no-install debug-toolkit hub dev');
    expect(result.action.attempted.map((item) => item.endpoint).sort()).toEqual([
      'http://10.0.0.9:3800',
      LOCAL,
    ]);
  });

  it('returns PROTOCOL_MISMATCH when every reachable Hub is incompatible', async () => {
    const result = await run({}, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'incompatible'),
        probe(REMOTE, 'incompatible'),
      ]),
      listAllSessions: async () => {
        throw new Error('sessions should not run');
      },
    });
    expect(result).toMatchObject({ state: 'unavailable', code: 'PROTOCOL_MISMATCH' });
    expect(result.error.attempted.every((item) => item.phase === 'probe')).toBe(true);
  });

  it('treats mixed incompatible and 503 implicit results as local Hub action', async () => {
    const result = await run({}, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'incompatible'),
        probe(REMOTE, 'not_ready'),
      ]),
    });
    expect(result).toMatchObject({
      state: 'action_required',
      code: 'LOCAL_HUB_NOT_RUNNING',
    });
  });

  it('maps explicit Hub 503 to CONNECT_HUB/hub_not_ready and never falls back', async () => {
    const probed = [];
    const result = await run({ hub: REMOTE }, {
      resolveCliHubCandidates: async (opts) => {
        probed.push(opts.explicitEndpoint);
        return discovered([probe(opts.explicitEndpoint, 'not_ready')], true);
      },
    });
    expect(probed).toEqual([REMOTE]);
    expect(result).toMatchObject({
      state: 'action_required',
      code: 'CONNECT_HUB',
      action: { reasonCode: 'hub_not_ready' },
    });
  });

  it('maps explicit Hub unreachable without implicit fallback', async () => {
    const result = await run({ hub: REMOTE }, {
      resolveCliHubCandidates: async (opts) => discovered([
        probe(opts.explicitEndpoint, 'unreachable'),
      ], true),
    });
    expect(result).toMatchObject({
      code: 'CONNECT_HUB',
      action: { reasonCode: 'explicit_hub_unreachable' },
    });
  });
});

describe('diagnoseCommand snapshots and targeting', () => {
  it('returns CAPTURE_LOGS/no_app for a compatible empty Hub', async () => {
    const result = await run({}, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: [] }),
        probe(REMOTE, 'unreachable'),
      ]),
      listAllSessions: async () => {
        throw new Error('no apps to list');
      },
    });
    expect(result).toMatchObject({
      state: 'action_required',
      code: 'CAPTURE_LOGS',
      action: { reasonCode: 'no_app', captureStep: 'open_app', attempt: 1 },
    });
  });

  it('returns CAPTURE_LOGS/no_session when a requested App has zero Sessions', async () => {
    const listed = [];
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async (endpoint, appId, query) => {
        listed.push({ endpoint, appId, query });
        return { sessions: [], pages: 1 };
      },
    });
    expect(listed).toEqual([expect.objectContaining({
      endpoint: LOCAL,
      appId: 'com.example.app',
    })]);
    expect(listed[0].query.includeEventSummary).toBe('1');
    expect(listed[0].query.timeBasis).toBe('event');
    expect(result).toMatchObject({
      code: 'CAPTURE_LOGS',
      action: { reasonCode: 'no_session', captureStep: 'upload_once', attempt: 2 },
    });
  });

  it('selects a requested App on the second Hub over an unrelated loopback Hub', async () => {
    const listed = [];
    const readCalls = [];
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.other'] }),
        probe(REMOTE, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async (endpoint, appId) => {
        listed.push({ endpoint, appId });
        if (endpoint === REMOTE && appId === 'com.example.app') {
          return { sessions: [session('sess-remote')], pages: 1 };
        }
        return { sessions: [session('sess-local')], pages: 1 };
      },
      readContext: async (opts) => {
        readCalls.push(opts);
        return okContext();
      },
    });
    expect(listed).toEqual([{ endpoint: REMOTE, appId: 'com.example.app' }]);
    expect(result.state).toBe('evidence_ready');
    expect(result.target.control.hub).toBe(REMOTE);
    expect(result.target.control.appId).toBe('com.example.app');
    expect(readCalls[0]).toMatchObject({
      endpoint: REMOTE,
      appId: 'com.example.app',
      session: 'sess-remote',
      allowStale: true,
      timeBasis: 'event',
    });
  });

  it('asks for selection when two Sessions remain', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({
        sessions: [session('sess-a'), session('sess-b')],
        pages: 1,
      }),
    });
    expect(result).toMatchObject({
      state: 'selection_required',
      code: 'TARGET_SELECTION_REQUIRED',
    });
    expect(result.selection.candidates).toHaveLength(2);
  });

  it('maps explicit time with no overlap to CONFIRM_TIME', async () => {
    const result = await run({
      appId: 'com.example.app',
      since: '2026-08-17T04:00:00.000Z',
      until: '2026-08-17T04:10:00.000Z',
    }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async (_endpoint, _appId, query) => {
        expect(query.since).toBe('2026-08-17T04:00:00.000Z');
        expect(query.until).toBe('2026-08-17T04:10:00.000Z');
        return {
          sessions: [session('sess-1', {
            observation: observation({
              matchedEventCount: 0,
              nearestEventTimestamp: '2026-08-17T02:32:00.000Z',
            }),
          })],
          pages: 1,
        };
      },
    });
    expect(result).toMatchObject({
      code: 'CONFIRM_TIME',
      action: { reasonCode: 'no_time_overlap' },
    });
    expect(result.action.retryArgs.includes('--since')).toBe(false);
  });

  it('does not auto-select Hub A when Hub B advertised a relevant App and then failed', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: [] }),
        probe(REMOTE, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async (endpoint) => {
        throw new HubReadError({
          code: 'HUB_UNREACHABLE',
          message: 'Hub is unreachable',
          endpoint,
          path: '/v1/apps/com.example.app/sessions',
        });
      },
    });
    expect(result).toMatchObject({
      code: 'CONNECT_HUB',
      action: { reasonCode: 'candidate_hub_unreachable' },
    });
    expect(result.state).not.toBe('evidence_ready');
    expect(result.action.reasonCode).not.toBe('no_app');
  });

  it('maps a relevant 503 snapshot to CONNECT_HUB/hub_not_ready', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: [] }),
        probe(REMOTE, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async (endpoint) => {
        throw new HubReadError({
          code: 'HUB_NOT_READY',
          message: 'Hub is not ready',
          endpoint,
          path: '/v1/apps/com.example.app/sessions',
          httpStatus: 503,
        });
      },
    });
    expect(result).toMatchObject({
      code: 'CONNECT_HUB',
      action: { reasonCode: 'hub_not_ready' },
    });
  });

  it('probes only the owned Hub once selected.hub is in the token', async () => {
    const selected = deriveResumeState(createResumeState({
      hub: REMOTE,
      appId: 'com.example.app',
    }), {
      select: { hub: REMOTE, appId: 'com.example.app', sessionId: 'sess-1' },
    });
    const probed = [];
    await run({
      resumeToken: encodeResumeToken(selected.state),
    }, {
      resolveCliHubCandidates: async (opts) => {
        probed.push(opts);
        return discovered([probe(REMOTE, 'compatible', { apps: ['com.example.app'] })], true);
      },
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => okContext(),
    });
    expect(probed).toHaveLength(1);
    expect(probed[0].explicitEndpoint).toBe(REMOTE);
    expect(probed[0].projectEndpoint).toBe(null);
  });
});

describe('diagnoseCommand evidence and context failures', () => {
  function uniqueDeps(overrides = {}) {
    const readCalls = [];
    return {
      readCalls,
      deps: {
        resolveCliHubCandidates: async () => discovered([
          probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
        ]),
        listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
        readContext: async (opts) => {
          readCalls.push(opts);
          return okContext();
        },
        ...overrides,
      },
    };
  }

  it('reads context with ISO event window and returns evidence_ready', async () => {
    const { readCalls, deps } = uniqueDeps();
    const result = await run({ appId: 'com.example.app' }, deps);
    expect(result.state).toBe('evidence_ready');
    expect(result.code).toBe(null);
    expect(readCalls[0].since).toBe('2026-08-17T02:30:00.000Z');
    expect(readCalls[0].until).toBe('2026-08-17T02:40:00.000Z');
    expect(readCalls[0].since.includes('T')).toBe(true);
    expect(result.target.control.hub).toBe(LOCAL);
    expect(result.session.connectionState).toBe('active');
    expect(result.window.timeBasis).toBe('event');
    expect(result.context.events).toHaveLength(1);
    expect(result.completeness).toMatchObject({
      matched: 1,
      selected: 1,
      omitted: 0,
    });
    expect(result.completeness.ranges.event).toEqual({
      since: '2026-08-17T02:32:00.000Z',
      until: '2026-08-17T02:32:00.000Z',
    });
    expect(result.target.control.resumeArgs.includes('--since')).toBe(false);
    expect(result.target.control.resumeArgs.includes('--until')).toBe(false);
  });

  it('merges a bounded warning when an irrelevant Hub fails', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
        probe(REMOTE, 'unreachable'),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => okContext(),
    });
    expect(result.state).toBe('evidence_ready');
    expect(result.completeness.warnings).toEqual([
      {
        contentTrust: 'trusted-control',
        endpoint: REMOTE,
        phase: 'probe',
        code: 'HUB_UNREACHABLE',
      },
    ]);
    expect(result.session.warnings).toEqual(result.completeness.warnings);
  });

  it('keeps Hub/App/Session selected after unique empty context', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => okContext({
        events: [],
        matched: 0,
        omitted: 0,
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
        },
      }),
    });
    expect(result).toMatchObject({
      code: 'CAPTURE_LOGS',
      action: { reasonCode: 'empty_session', captureStep: 'upload_once', attempt: 2 },
    });
    const decoded = decodeResumeToken(tokenFromArgs(result.action.retryArgs));
    expect(decoded.ok).toBe(true);
    expect(decoded.state.selected).toEqual({
      hub: LOCAL,
      appId: 'com.example.app',
      sessionId: 'sess-1',
    });
  });

  it('returns empty evidence_ready for an explicit Session and time with zero matches', async () => {
    const result = await run({
      appId: 'com.example.app',
      session: 'sess-1',
      since: '2026-08-17T03:00:00.000Z',
      until: '2026-08-17T03:10:00.000Z',
    }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({
        sessions: [session('sess-1', {
          observation: observation({
            matchedEventCount: 0,
            eventTimeRange: { since: '2026-08-17T02:32:00.000Z', until: '2026-08-17T02:32:00.000Z' },
            nearestEventTimestamp: '2026-08-17T02:32:00.000Z',
          }),
        })],
        pages: 1,
      }),
      readContext: async () => ({
        ok: true,
        connectionState: 'active',
        syncState: 'live',
        events: [],
        window: {
          since: '2026-08-17T03:00:00.000Z',
          until: '2026-08-17T03:10:00.000Z',
          timeBasis: 'event',
        },
        ranges: { event: null, received: null },
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
        },
      }),
    });
    expect(result.state).toBe('evidence_ready');
    expect(result.context.events).toEqual([]);
    expect(result.completeness.matched).toBe(0);
  });

  it('releases only the Session after selected NO_SESSION', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => ({
        ok: false,
        code: 'NO_SESSION',
        message: 'Session not found',
        endpoint: LOCAL,
        httpStatus: 404,
      }),
    });
    expect(result).toMatchObject({
      code: 'CAPTURE_LOGS',
      action: { reasonCode: 'no_session' },
    });
    expect(result.action.retryArgs.includes('--session')).toBe(false);
    const decoded = decodeResumeToken(tokenFromArgs(result.action.retryArgs));
    expect(decoded.state.selected).toEqual({
      hub: LOCAL,
      appId: 'com.example.app',
      sessionId: null,
    });
    expect(decoded.state.sessionReleasedForCapture).toBe(true);
  });

  it('maps selected transport failure then repeats to HUB_UNREACHABLE', async () => {
    const deps = {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => ({
        ok: false,
        code: 'HUB_UNREACHABLE',
        message: 'Hub is unreachable',
        endpoint: LOCAL,
        httpStatus: null,
      }),
    };
    const first = await run({ appId: 'com.example.app' }, deps);
    expect(first).toMatchObject({
      code: 'CONNECT_HUB',
      action: { reasonCode: 'candidate_hub_unreachable' },
    });
    const second = await run(optionsFromArgv(first.action.retryArgs), deps);
    expect(second).toMatchObject({
      state: 'unavailable',
      code: 'HUB_UNREACHABLE',
    });
  });

  it('maps selected protocol mismatch to terminal PROTOCOL_MISMATCH', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => ({
        ok: false,
        code: 'PROTOCOL_MISMATCH',
        message: 'Hub protocol mismatch',
        endpoint: LOCAL,
        httpStatus: 426,
      }),
    });
    expect(result).toMatchObject({ state: 'unavailable', code: 'PROTOCOL_MISMATCH' });
  });

  it('maps malformed context success to INVALID_RESPONSE', async () => {
    const result = await run({ appId: 'com.example.app' }, {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext: async () => ({ ok: true, events: [] }),
    });
    expect(result).toMatchObject({ state: 'unavailable', code: 'INVALID_RESPONSE' });
  });

  it('rejects invalid time before Session I/O', async () => {
    let listed = 0;
    const result = await run({ at: '08/17/2026' }, {
      resolveCliHubCandidates: async () => discovered([probe(LOCAL, 'compatible', { apps: ['com.example.app'] })]),
      listAllSessions: async () => {
        listed += 1;
        return { sessions: [], pages: 1 };
      },
    });
    expect(listed).toBe(0);
    expect(result).toMatchObject({ state: 'unavailable', code: 'INVALID_ARGUMENT' });
  });
});

describe('diagnoseCommand evidence window narrowing', () => {
  function omittedContext() {
    return okContext({
      omitted: 5,
      matched: 6,
      completeness: {
        matched: 6,
        selected: 1,
        omitted: 5,
        previewed: 0,
        observedTypes: ['console'],
        totalByType: { console: 6 },
        syncState: 'live',
        connectionState: 'active',
        warnings: [],
      },
    });
  }

  function uniqueDeps(readContext) {
    return {
      resolveCliHubCandidates: async () => discovered([
        probe(LOCAL, 'compatible', { apps: ['com.example.app'] }),
      ]),
      listAllSessions: async () => ({ sessions: [session('sess-1')], pages: 1 }),
      readContext,
    };
  }

  async function narrowAndAssert(initialOptions) {
    const readCalls = [];
    const deps = uniqueDeps(async (opts) => {
      readCalls.push(opts);
      return omittedContext();
    });
    const first = await run({ appId: 'com.example.app', ...initialOptions }, deps);
    expect(first.state).toBe('evidence_ready');
    expect(first.completeness.omitted).toBe(5);
    const args = first.target.control.resumeArgs;
    expect(args.filter((item) => item === '--since')).toHaveLength(0);
    expect(args.filter((item) => item === '--until')).toHaveLength(0);
    expect(args.filter((item) => item === '--at')).toHaveLength(0);
    expect(args.filter((item) => item === '--resume-token')).toHaveLength(1);

    const decoded = decodeResumeToken(tokenFromArgs(args));
    expect(decoded.ok).toBe(true);
    expect(decoded.state.time.kind).toBe('range');
    const sinceMs = Date.parse(decoded.state.time.since);
    const untilMs = Date.parse(decoded.state.time.until);
    const subset = untilMs - sinceMs >= 1000
      ? { since: decoded.state.time.since, until: new Date(untilMs - 1000).toISOString() }
      : { since: decoded.state.time.since, until: decoded.state.time.until };
    const narrowed = await run(optionsFromArgv(args, subset), deps);
    expect(narrowed.state).toBe('evidence_ready');
    expect(narrowed.target.control.hub).toBe(LOCAL);
    expect(narrowed.target.control.appId).toBe('com.example.app');
    expect(narrowed.target.control.sessionId).toBe('sess-1');
    const last = readCalls[readCalls.length - 1];
    expect(last.since).toMatch(/T/);
    expect(last.until).toMatch(/T/);
    expect(Number.isNaN(Number(last.since))).toBe(true);

    const wider = await run(optionsFromArgv(args, {
      since: '2026-08-17T01:00:00.000Z',
      until: '2026-08-17T05:00:00.000Z',
    }), deps);
    expect(wider).toMatchObject({ code: 'INVALID_ARGUMENT' });

    const shifted = await run(optionsFromArgv(args, {
      since: '2026-08-17T03:00:00.000Z',
      until: '2026-08-17T03:10:00.000Z',
    }), deps);
    expect(shifted).toMatchObject({ code: 'INVALID_ARGUMENT' });
  }

  it('narrows a default-window evidence result', async () => {
    await narrowAndAssert({});
  });

  it('narrows an original --at evidence result', async () => {
    await narrowAndAssert({ at: AT_1032 });
  });

  it('narrows an original range evidence result', async () => {
    await narrowAndAssert({
      since: '2026-08-17T02:20:00.000Z',
      until: '2026-08-17T02:40:00.000Z',
    });
  });
});

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createHubServer } = require('../src/server/hubServer');

const BIN = path.join(__dirname, '../../../bin/debug-toolkit.js');
const APP_ID = 'com.example.diagnose';

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  delete env.JEST_WORKER_ID;
  delete env.DEBUG_TOOLKIT_HUB_ENDPOINT;
  delete env.DEBUG_TOOLKIT_APP_ID;
  return env;
}

function uuid(n) {
  return `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
}

function runDiagnose(args, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, 'diagnose', ...args], {
      env: childEnv(extra.env),
      cwd: extra.cwd || process.cwd(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), extra.timeout || 15000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

function parseResult(spawned) {
  const result = JSON.parse(spawned.stdout.trim().split('\n').pop());
  expect(validateDiagnoseResult(result)).toEqual({ ok: true });
  expect(spawned.status).toBe(getDiagnoseExitCode(result));
  return result;
}

function hubRequest(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: body ? { 'content-type': 'application/json' } : undefined,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function startHub() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-diagnose-hub-'));
  const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
  const started = await server.start();
  return {
    server,
    dataDir,
    port: started.address.port,
    url: `http://127.0.0.1:${started.address.port}`,
  };
}

async function seedSession(port, { appId = APP_ID, sessionId, timestamp = Date.now(), data = { message: 'hello' } }) {
  const opened = await hubRequest(port, 'POST', `/api/v1/apps/${appId}/sessions`, {
    protocolVersion: 1,
    canonicalVersion: 1,
    sessionId,
    startedAt: timestamp,
    clientAckThrough: 0,
    device: { platform: 'ios', osVersion: '18', model: 'iPhone 15', nativeApplicationId: appId },
  });
  expect(opened.status).toBe(201);
  const appended = await hubRequest(port, 'POST', `/api/v1/apps/${appId}/sessions/${sessionId}/events`, {
    firstSequence: 1,
    events: [{ sequence: 1, timestamp, type: 'console', severity: 'info', data }],
  });
  expect(appended.body).toMatchObject({ ok: true });
}

describe('diagnose real process', () => {
  it('discovers a unique App/Session with zero extra argv', async () => {
    const hub = await startHub();
    try {
      await seedSession(hub.port, { sessionId: uuid(1) });
      const spawned = await runDiagnose([], {
        env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: hub.url },
      });
      const result = parseResult(spawned);
      expect(result.state).toBe('evidence_ready');
      expect(result.target.control.appId).toBe(APP_ID);
      expect(result.target.control.sessionId).toBe(uuid(1));
      expect(result.window.timeBasis).toBe('event');
    } finally {
      await hub.server.stop();
      fs.rmSync(hub.dataDir, { recursive: true, force: true });
    }
  });

  it('keeps an explicit remote Hub and ignores an unrelated loopback Hub', async () => {
    const local = await startHub();
    const remote = await startHub();
    try {
      await seedSession(local.port, { appId: 'com.other', sessionId: uuid(1) });
      await seedSession(remote.port, { appId: APP_ID, sessionId: uuid(2) });
      const spawned = await runDiagnose(['--hub', remote.url, '--app-id', APP_ID], {
        env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: local.url },
      });
      const result = parseResult(spawned);
      expect(result.state).toBe('evidence_ready');
      expect(result.target.control.hub).toBe(remote.url);
      expect(result.target.control.sessionId).toBe(uuid(2));
    } finally {
      await local.server.stop();
      await remote.server.stop();
      fs.rmSync(local.dataDir, { recursive: true, force: true });
      fs.rmSync(remote.dataDir, { recursive: true, force: true });
    }
  });

  it('asks for selection when two Sessions are present', async () => {
    const hub = await startHub();
    try {
      await seedSession(hub.port, { sessionId: uuid(1) });
      await seedSession(hub.port, { sessionId: uuid(2) });
      const spawned = await runDiagnose(['--app-id', APP_ID], {
        env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: hub.url },
      });
      const result = parseResult(spawned);
      expect(result).toMatchObject({
        state: 'selection_required',
        code: 'TARGET_SELECTION_REQUIRED',
      });
      expect(result.selection.candidates).toHaveLength(2);
    } finally {
      await hub.server.stop();
      fs.rmSync(hub.dataDir, { recursive: true, force: true });
    }
  });

  it('maps process exits for argument, ambiguous target, and local Hub action', async () => {
    const closed = await startHub();
    const closedUrl = closed.url;
    await closed.server.stop();
    fs.rmSync(closed.dataDir, { recursive: true, force: true });

    const invalid = await runDiagnose(['--at', '08/17/2026'], {
      env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: closedUrl },
    });
    const invalidResult = parseResult(invalid);
    expect(invalidResult).toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(invalid.status).toBe(2);

    const hub = await startHub();
    try {
      await seedSession(hub.port, { sessionId: uuid(1) });
      await seedSession(hub.port, { sessionId: uuid(2) });
      const ambiguous = await runDiagnose(['--app-id', APP_ID, '--target-match', 'iPhone 15 $(touch x)'], {
        env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: hub.url },
      });
      const ambiguousResult = parseResult(ambiguous);
      expect(ambiguousResult).toMatchObject({ code: 'TARGET_AMBIGUOUS' });
      expect(ambiguous.status).toBe(3);
    } finally {
      await hub.server.stop();
      fs.rmSync(hub.dataDir, { recursive: true, force: true });
    }

    const localMissing = await runDiagnose([], {
      env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: closedUrl },
    });
    const localResult = parseResult(localMissing);
    expect(localResult).toMatchObject({
      code: 'LOCAL_HUB_NOT_RUNNING',
      action: { suggestedCommand: 'npx --no-install debug-toolkit hub dev' },
    });
    expect(localMissing.status).toBe(0);
  });

  it('maps PROTOCOL_MISMATCH to exit 4 against an owned incompatible server', async () => {
    const fake = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name: 'other-hub', protocolVersion: 1 }));
    });
    await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
    const port = fake.address().port;
    const url = `http://127.0.0.1:${port}`;
    try {
      const spawned = await runDiagnose(['--hub', url], {
        env: { DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: url },
      });
      const result = parseResult(spawned);
      expect(result).toMatchObject({ code: 'PROTOCOL_MISMATCH' });
      expect(spawned.status).toBe(4);
    } finally {
      await new Promise((resolve) => fake.close(resolve));
    }
  });
});
