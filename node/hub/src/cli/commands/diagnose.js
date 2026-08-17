'use strict';

const { toIsoInstant } = require('../../protocol/time');
const { finalizeDiagnoseResult } = require('../diagnoseResultSchema');
const {
  loadAndMergeResumeState,
  deriveResumeState,
  buildResumeArgs,
  MISSING_SESSION_AUTH,
  EVIDENCE_PROJECTION_AUTH,
} = require('../diagnoseResumeToken');
const { resolveCliHubCandidates } = require('../resolveEndpoint');
const { listAllSessions, HubReadError } = require('../httpClient');
const { readContext } = require('./context');
const { parseDiagnoseTime, resolveDiagnoseTarget } = require('../diagnoseTargetResolver');
const { materializeDiagnoseDecision, materializeHubFailure } = require('../diagnoseActionState');

const MAX_ATTEMPTS = 12;
const MAX_WARNINGS = 12;

function windowToHttpQuery(window) {
  const since = toIsoInstant(window.sinceMs);
  const until = toIsoInstant(window.untilMs);
  if (!since || !until) {
    throw new RangeError('Diagnostic window is outside the supported ISO time range');
  }
  return {
    since,
    until,
    timeBasis: 'event',
  };
}

function invalidArgument(message, attempted = []) {
  return {
    schemaVersion: 1,
    state: 'unavailable',
    code: 'INVALID_ARGUMENT',
    error: { message, attempted },
  };
}

function invalidResponse(message, attempted = []) {
  return {
    schemaVersion: 1,
    state: 'unavailable',
    code: 'INVALID_RESPONSE',
    error: { message, attempted },
  };
}

function hubAttempt(fields) {
  return {
    endpoint: fields.endpoint,
    phase: fields.phase,
    kind: fields.kind,
    code: fields.code,
    httpStatus: fields.httpStatus == null ? null : fields.httpStatus,
    appId: fields.appId == null ? null : fields.appId,
    appCount: fields.appCount || 0,
    pageCount: fields.pageCount || 0,
    sessionCount: fields.sessionCount || 0,
  };
}

function capAttempts(attempted) {
  return attempted.slice(0, MAX_ATTEMPTS);
}

function readyApps(payload) {
  const apps = payload && Array.isArray(payload.apps) ? payload.apps : [];
  return apps.map((item) => (typeof item === 'string' ? item : item && item.appId)).filter(Boolean);
}

function probeToAttempt(result) {
  const kind = result.kind || 'unreachable';
  let code = kind;
  if (kind === 'unreachable') {
    code = 'HUB_UNREACHABLE';
  } else if (kind === 'not_ready') {
    code = 'HUB_NOT_READY';
  }
  return hubAttempt({
    endpoint: result.endpoint,
    phase: 'probe',
    kind,
    code,
    httpStatus: result.httpStatus == null ? null : result.httpStatus,
    appId: null,
    appCount: readyApps(result.payload).length,
    pageCount: 0,
    sessionCount: 0,
  });
}

function warningFromAttempt(attempt) {
  return {
    contentTrust: 'trusted-control',
    endpoint: attempt.endpoint,
    phase: attempt.phase,
    code: attempt.code,
  };
}

function mergeWarnings(left, right, cap = MAX_WARNINGS) {
  const out = [];
  const seen = new Set();
  for (const warning of [...(left || []), ...(right || [])]) {
    const key = typeof warning === 'string'
      ? `s:${warning}`
      : `t:${warning.endpoint}|${warning.phase}|${warning.code}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(warning);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

function effectiveTimeOptions(options, resumeState) {
  if (options.at || options.since || options.until) {
    return options;
  }
  if (resumeState?.time?.kind === 'at') {
    return { ...options, at: resumeState.time.at };
  }
  if (resumeState?.time?.kind === 'range') {
    return { ...options, since: resumeState.time.since, until: resumeState.time.until };
  }
  return options;
}

function hasExplicitSession(options, state) {
  return Boolean(options.session || state.discovery.sessionId);
}

function hasExplicitTime(options, state) {
  if (options.at || options.since || options.until) {
    return true;
  }
  return Boolean(state.time && state.time.kind !== 'none');
}

function relevantAppIds(advertised, explicitAppId) {
  if (!explicitAppId) {
    return advertised.slice();
  }
  return advertised.filter((appId) => appId === explicitAppId);
}

function classifyNoCompatible(discovered) {
  const attempted = capAttempts(discovered.results.map(probeToAttempt));
  const reachable = discovered.results.filter((item) => item.kind !== 'unreachable');
  if (reachable.length > 0 && reachable.every((item) => item.kind === 'incompatible')) {
    return { code: 'PROTOCOL_MISMATCH', attempted };
  }
  if (discovered.explicit) {
    const first = discovered.results[0];
    if (first && first.kind === 'not_ready') {
      return { reasonCode: 'hub_not_ready', attempted };
    }
    return { reasonCode: 'explicit_hub_unreachable', attempted };
  }
  return { reasonCode: 'no_usable_implicit_hub', attempted };
}

function mapListError(err, endpoint, appId) {
  const code = err instanceof HubReadError ? err.code : 'HUB_UNREACHABLE';
  const httpStatus = err instanceof HubReadError ? err.httpStatus : null;
  let kind = 'unreachable';
  if (code === 'HUB_NOT_READY') {
    kind = 'not_ready';
  } else if (code === 'PROTOCOL_MISMATCH') {
    kind = 'incompatible';
  } else if (code === 'INVALID_RESPONSE') {
    kind = 'invalid';
  }
  return {
    code,
    endpoint,
    attempt: hubAttempt({
      endpoint,
      phase: 'sessions',
      kind,
      code,
      httpStatus,
      appId,
      appCount: 0,
      pageCount: 0,
      sessionCount: 0,
    }),
  };
}

function materializeAndFinalize(wrapped) {
  return finalizeDiagnoseResult(wrapped.result);
}

async function loadHubSnapshots(compatible, state, listAllSessionsFn, timeQuery, explicitAppId) {
  const hubs = [];
  const attempted = [];
  const relevantFailures = [];

  for (const item of compatible) {
    const advertised = readyApps(item.payload);
    const appsToLoad = relevantAppIds(advertised, explicitAppId);
    if (appsToLoad.length === 0) {
      hubs.push({ endpoint: item.endpoint, ready: true, apps: [] });
      continue;
    }

    const hubApps = [];
    let failed = false;
    for (const appId of appsToLoad) {
      try {
        const query = {
          includeEventSummary: '1',
          timeBasis: 'event',
          ...(timeQuery || {}),
        };
        const listed = await listAllSessionsFn(item.endpoint, appId, query);
        const sessions = listed && Array.isArray(listed.sessions) ? listed.sessions : null;
        if (!sessions) {
          throw new HubReadError({
            code: 'INVALID_RESPONSE',
            message: 'Hub returned an invalid response',
            endpoint: item.endpoint,
            path: `/v1/apps/${appId}/sessions`,
          });
        }
        attempted.push(hubAttempt({
          endpoint: item.endpoint,
          phase: 'sessions',
          kind: 'ok',
          code: 'ok',
          httpStatus: 200,
          appId,
          appCount: 0,
          pageCount: listed.pages || 1,
          sessionCount: sessions.length,
        }));
        hubApps.push({ appId, sessions });
      } catch (err) {
        const mapped = mapListError(err, item.endpoint, appId);
        attempted.push(mapped.attempt);
        relevantFailures.push(mapped);
        failed = true;
        break;
      }
    }
    if (!failed) {
      hubs.push({ endpoint: item.endpoint, ready: true, apps: hubApps });
    }
  }

  return { hubs, attempted, relevantFailures };
}

function mapRelevantSnapshotFailure(failure, attempted, resumeState) {
  if (failure.code === 'PROTOCOL_MISMATCH') {
    return materializeAndFinalize(materializeHubFailure({
      code: 'PROTOCOL_MISMATCH',
      attempted,
    }, resumeState));
  }
  if (failure.code === 'INVALID_RESPONSE') {
    return finalizeDiagnoseResult(invalidResponse('Hub returned an invalid Session snapshot', attempted));
  }
  if (failure.code === 'HUB_NOT_READY') {
    return materializeAndFinalize(materializeHubFailure({
      reasonCode: 'hub_not_ready',
      attempted,
    }, resumeState));
  }
  return materializeAndFinalize(materializeHubFailure({
    reasonCode: 'candidate_hub_unreachable',
    attempted,
  }, resumeState));
}

function contextAttempt(endpoint, appId, code, httpStatus) {
  return hubAttempt({
    endpoint,
    phase: 'context',
    kind: code === 'HUB_NOT_READY' ? 'not_ready' : (code === 'HUB_UNREACHABLE' ? 'unreachable' : 'error'),
    code,
    httpStatus,
    appId,
    appCount: 0,
    pageCount: 0,
    sessionCount: 0,
  });
}

function mapContextFailure(failure, nextState, io) {
  const attempted = capAttempts([
    ...io.attempted,
    contextAttempt(failure.endpoint, io.appId, failure.code || 'INVALID_RESPONSE', failure.httpStatus),
  ]);
  if (failure.code === 'NO_SESSION') {
    const released = deriveResumeState(nextState, {
      releaseSessionForCapture: MISSING_SESSION_AUTH,
    });
    if (!released.ok) {
      return finalizeDiagnoseResult(invalidResponse(released.message, attempted));
    }
    return materializeAndFinalize(materializeDiagnoseDecision({
      kind: 'fact',
      reasonCode: 'no_session',
    }, released.state));
  }
  if (failure.code === 'PROTOCOL_MISMATCH') {
    return finalizeDiagnoseResult({
      schemaVersion: 1,
      state: 'unavailable',
      code: 'PROTOCOL_MISMATCH',
      error: { message: 'Hub protocol mismatch', attempted },
    });
  }
  if (failure.code === 'HUB_NOT_READY') {
    return materializeAndFinalize(materializeHubFailure({
      reasonCode: 'hub_not_ready',
      attempted,
    }, nextState));
  }
  if (failure.code === 'HUB_UNREACHABLE') {
    return materializeAndFinalize(materializeHubFailure({
      reasonCode: 'candidate_hub_unreachable',
      attempted,
    }, nextState));
  }
  return finalizeDiagnoseResult(invalidResponse(failure.message || 'Invalid context response', attempted));
}

function buildEvidenceResult(decision, evidenceState, context, io) {
  const warnings = mergeWarnings(context.completeness.warnings, io.warnings, MAX_WARNINGS);
  return {
    schemaVersion: 1,
    state: 'evidence_ready',
    code: null,
    target: {
      ...decision.target,
      control: {
        ...decision.target.control,
        resumeArgs: buildResumeArgs(evidenceState, { omitTime: true }),
      },
    },
    session: {
      connectionState: context.connectionState,
      syncState: context.syncState,
      warnings,
    },
    window: context.window,
    context: {
      contentTrust: 'untrusted',
      events: context.events || [],
    },
    completeness: {
      matched: context.completeness.matched,
      selected: context.completeness.selected,
      omitted: context.completeness.omitted,
      previewed: context.completeness.previewed,
      observedTypes: context.completeness.observedTypes,
      totalByType: context.completeness.totalByType,
      syncState: context.completeness.syncState,
      connectionState: context.completeness.connectionState,
      warnings,
      ranges: context.ranges,
    },
  };
}

async function readSelectedEvidence(decision, nextState, readContextFn, io) {
  const query = windowToHttpQuery(decision.window);
  const control = decision.target.control;
  let context;
  try {
    context = await readContextFn({
      endpoint: control.hub,
      appId: control.appId,
      session: control.sessionId,
      allowStale: true,
      timeBasis: 'event',
      since: query.since,
      until: query.until,
    });
  } catch (err) {
    return finalizeDiagnoseResult(invalidResponse(err.message || 'context read failed', io.attempted));
  }

  if (!context || context.ok === false) {
    return mapContextFailure(context || { code: 'INVALID_RESPONSE', message: 'empty context' }, nextState, {
      ...io,
      appId: control.appId,
    });
  }

  if (
    !context.completeness
    || !Number.isInteger(context.completeness.matched)
    || !context.window
    || context.window.timeBasis !== 'event'
    || !Array.isArray(context.events)
    || !context.ranges
  ) {
    return finalizeDiagnoseResult(invalidResponse('Hub returned a malformed context payload', io.attempted));
  }

  const captureInProgress = Array.isArray(nextState.capture?.completed) && nextState.capture.completed.length > 0;
  if (context.completeness.matched === 0) {
    if (captureInProgress || !io.allowZeroMatchEvidence) {
      const reason = context.syncState === 'paused' ? 'paused_empty' : 'empty_session';
      return materializeAndFinalize(materializeDiagnoseDecision({
        kind: 'fact',
        reasonCode: reason,
      }, nextState));
    }
  }

  const bound = deriveResumeState(nextState, {
    bindEvidenceWindow: {
      auth: EVIDENCE_PROJECTION_AUTH,
      sinceMs: decision.window.sinceMs,
      untilMs: decision.window.untilMs,
    },
  });
  if (!bound.ok) {
    return finalizeDiagnoseResult(invalidResponse(bound.message, io.attempted));
  }
  return finalizeDiagnoseResult(buildEvidenceResult(decision, bound.state, context, io));
}

async function diagnoseCommand(options, dependencies = {}) {
  const deps = {
    resolveCliHubCandidates,
    listAllSessions,
    readContext,
    now: () => Date.now(),
    ...dependencies,
  };

  const resumed = loadAndMergeResumeState(options);
  if (!resumed.ok) {
    return finalizeDiagnoseResult(invalidArgument(resumed.message, [{
      field: 'resume',
      message: resumed.message,
    }]));
  }

  try {
    const timeParse = parseDiagnoseTime(effectiveTimeOptions(options, resumed.state), deps.now());
    if (!timeParse.ok) {
      return finalizeDiagnoseResult(invalidArgument(timeParse.message, [{
        field: timeParse.field || 'time',
        message: timeParse.message,
      }]));
    }

    const pinnedHub = resumed.state.selected.hub || resumed.state.discovery.explicitHub;
    const discovered = await deps.resolveCliHubCandidates({
      explicitEndpoint: pinnedHub,
      projectEndpoint: resumed.state.discovery.projectEndpoint,
      localEndpoint: options.localHubEndpoint,
    });

    const probeAttempts = discovered.results.map(probeToAttempt);
    const compatible = discovered.results.filter((item) => item.kind === 'compatible');
    if (compatible.length === 0) {
      return materializeAndFinalize(materializeHubFailure(classifyNoCompatible(discovered), resumed.state));
    }

    const irrelevantWarnings = discovered.results
      .filter((item) => item.kind !== 'compatible')
      .map((item) => warningFromAttempt(probeToAttempt(item)));

    let timeQuery = null;
    if (timeParse.explicit) {
      timeQuery = windowToHttpQuery(timeParse);
    }

    const explicitAppId = resumed.state.selected.appId || options.appId || resumed.state.discovery.appId || null;
    const snapshots = await loadHubSnapshots(
      compatible,
      resumed.state,
      deps.listAllSessions,
      timeQuery,
      explicitAppId,
    );
    const attempted = capAttempts([...probeAttempts, ...snapshots.attempted]);

    if (snapshots.relevantFailures.length > 0) {
      return mapRelevantSnapshotFailure(snapshots.relevantFailures[0], attempted, resumed.state);
    }

    const decision = resolveDiagnoseTarget({
      hubs: snapshots.hubs,
      options,
      resumeState: resumed.state,
      nowMs: deps.now(),
    });
    if (decision.kind !== 'selected') {
      return materializeAndFinalize(materializeDiagnoseDecision(decision, resumed.state));
    }
    return readSelectedEvidence(decision, decision.nextState, deps.readContext, {
      warnings: mergeWarnings(irrelevantWarnings, [], MAX_WARNINGS),
      attempted,
      allowZeroMatchEvidence: hasExplicitSession(options, resumed.state) && hasExplicitTime(options, resumed.state),
    });
  } catch (err) {
    return finalizeDiagnoseResult(invalidResponse(err.message || 'diagnose failed', []));
  }
}

module.exports = {
  diagnoseCommand,
  windowToHttpQuery,
};
