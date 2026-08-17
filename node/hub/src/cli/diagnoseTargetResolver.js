'use strict';

const { parseIsoInstant, isValidTimestampMs, toIsoInstant } = require('../protocol/time');
const {
  createResumeState,
  deriveResumeState,
  buildResumeArgs,
} = require('./diagnoseResumeToken');

const FIVE_MIN_MS = 5 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const MAX_SELECTION = 20;
const MAX_FACET_VALUES = 8;
const MAX_EXAMPLES = 5;
const MAX_NEAREST = 3;
const MAX_TARGET_MATCH_CHARS = 512;
const MAX_TARGET_TOKENS = 32;
const MAX_TOKEN_CHARS = 128;
const MAX_DISPLAY_TOKEN = 64;

function invalid(message, field = 'time') {
  return {
    ok: false,
    code: 'INVALID_ARGUMENT',
    message,
    field,
  };
}

function parseDiagnoseTime(options, nowMs) {
  if (options.at && (options.since || options.until)) {
    return invalid('--at cannot be combined with --since/--until');
  }
  if (Boolean(options.since) !== Boolean(options.until)) {
    return invalid('--since and --until must be provided together');
  }
  if (options.at) {
    const atMs = parseIsoInstant(options.at);
    if (atMs === null) {
      return invalid('--at must be offset-bearing ISO-8601');
    }
    const sinceMs = atMs - FIVE_MIN_MS;
    const untilMs = atMs + FIVE_MIN_MS;
    if (!isValidTimestampMs(sinceMs) || !isValidTimestampMs(untilMs)) {
      return invalid('--at window is outside the supported ISO time range');
    }
    return { ok: true, explicit: true, sinceMs, untilMs, source: 'at', timeBasis: 'event' };
  }
  if (options.since) {
    const sinceMs = parseIsoInstant(options.since);
    const untilMs = parseIsoInstant(options.until);
    if (sinceMs === null || untilMs === null || sinceMs > untilMs) {
      return invalid('Invalid time range');
    }
    return { ok: true, explicit: true, sinceMs, untilMs, source: 'range', timeBasis: 'event' };
  }
  return {
    ok: true,
    explicit: false,
    sinceMs: nowMs - TEN_MIN_MS,
    untilMs: nowMs,
    source: 'default',
    timeBasis: 'event',
  };
}

function tokenizeTargetMatch(text) {
  if (typeof text !== 'string') {
    return [];
  }
  return text
    .split(/[\s\p{P}\p{S}]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLocaleLowerCase());
}

function validateTargetMatchInput(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return invalid('target match must be a non-empty string', 'target-match');
  }
  if (text.length > MAX_TARGET_MATCH_CHARS) {
    return invalid('target match exceeds 512 characters', 'target-match');
  }
  const tokens = tokenizeTargetMatch(text);
  if (tokens.length === 0) {
    return invalid('target match produced no tokens', 'target-match');
  }
  if (tokens.length > MAX_TARGET_TOKENS) {
    return invalid('target match exceeds 32 tokens', 'target-match');
  }
  for (const token of tokens) {
    if (token.length > MAX_TOKEN_CHARS) {
      return invalid('target match token exceeds 128 characters', 'target-match');
    }
  }
  return { ok: true, tokens, text };
}

function pickDisplayDeviceFields(device) {
  const src = device && typeof device === 'object' ? device : {};
  const out = {};
  for (const key of ['platform', 'osVersion', 'manufacturer', 'model', 'appVersion', 'buildNumber']) {
    if (typeof src[key] === 'string' && src[key].length > 0) {
      out[key] = src[key];
    }
  }
  return out;
}

function escapeDisplayLabel(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/[\n\r\t]/g, ' ')
    .slice(0, 256);
}

function formatDeviceLabel(session, appId) {
  const device = session.device || {};
  const name = device.model || device.platform || 'device';
  return `${name} / ${appId}`;
}

function makeFinalTargetCandidate(input, resumeState) {
  const { endpoint, appId, session } = input;
  const selected = deriveResumeState(resumeState, {
    select: { hub: endpoint, appId, sessionId: session.sessionId },
  });
  if (!selected.ok) {
    throw new Error(selected.message);
  }
  const deviceFields = pickDisplayDeviceFields(session.device);
  return {
    candidate: {
      control: {
        contentTrust: 'trusted-control',
        hub: endpoint,
        appId,
        sessionId: session.sessionId,
        sourceIp: session.sourceIp || null,
        connectionState: session.connectionState,
        syncState: session.syncState,
        lastSeenAt: session.lastSeenAt,
        resumeArgs: buildResumeArgs(selected.state),
      },
      observed: {
        contentTrust: 'untrusted-structured',
        eventTimeRange: session.observation?.eventTimeRange || null,
        receivedTimeRange: session.observation?.receivedTimeRange || null,
        matchedEventCount: Number(session.observation?.matchedEventCount) || 0,
      },
      device: { ...deviceFields, contentTrust: 'untrusted' },
      label: {
        contentTrust: 'untrusted',
        text: escapeDisplayLabel(formatDeviceLabel(session, appId)),
      },
    },
    nextState: selected.state,
  };
}

function isTimeRelevant(session) {
  return Number(session.observation?.matchedEventCount) > 0;
}

function hasRetainedEvents(session) {
  return Boolean(
    session.observation?.eventTimeRange
    || session.observation?.receivedTimeRange
    || session.observation?.nearestEventTimestamp
    || Number(session.observation?.matchedEventCount) > 0,
  );
}

function distanceToWindow(session, window) {
  const iso = session.observation?.nearestEventTimestamp;
  const ts = iso ? parseIsoInstant(iso) : null;
  if (ts == null) {
    return Number.POSITIVE_INFINITY;
  }
  if (ts < window.sinceMs) {
    return window.sinceMs - ts;
  }
  if (ts > window.untilMs) {
    return ts - window.untilMs;
  }
  return 0;
}

function matchHaystack(row) {
  const device = row.session.device || {};
  return [
    row.appId,
    device.platform,
    device.model,
    device.appVersion,
    device.osVersion,
    device.manufacturer,
    device.buildNumber,
    row.session.sourceIp,
  ]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => value.toLocaleLowerCase());
}

function rowMatchesTokens(row, tokens) {
  const fields = matchHaystack(row);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

function buildMatchAttempted(tokens, matchCount) {
  const display = tokens.slice(0, 8).map((token) => ({
    contentTrust: 'untrusted',
    text: token.slice(0, MAX_DISPLAY_TOKEN),
    truncated: token.length > MAX_DISPLAY_TOKEN,
  }));
  return [{
    tokens: display,
    matchCount,
    totalTokenCount: tokens.length,
    omittedTokenCount: tokens.length - display.length,
  }];
}

function addFacetValue(map, key, value) {
  if (!value) {
    return;
  }
  if (!map[key]) {
    map[key] = new Map();
  }
  map[key].set(value, (map[key].get(value) || 0) + 1);
}

function buildCandidateSummary(candidates) {
  const facetMaps = {};
  for (const candidate of candidates) {
    addFacetValue(facetMaps, 'app', candidate.control.appId);
    addFacetValue(facetMaps, 'platform', candidate.device.platform);
    addFacetValue(facetMaps, 'model', candidate.device.model);
    addFacetValue(facetMaps, 'version', candidate.device.appVersion);
    addFacetValue(facetMaps, 'sourceIp', candidate.control.sourceIp);
    const rangeUntil = candidate.observed.eventTimeRange?.until;
    const bucketMs = rangeUntil ? parseIsoInstant(rangeUntil) : null;
    if (bucketMs != null) {
      const bucket = Math.floor(bucketMs / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS;
      addFacetValue(facetMaps, 'eventBucket', toIsoInstant(bucket) || String(bucket));
    }
  }
  const facets = {};
  for (const [key, counts] of Object.entries(facetMaps)) {
    facets[key] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, MAX_FACET_VALUES)
      .map(([text, count]) => ({
        contentTrust: 'untrusted',
        text: String(text).slice(0, 256),
        count,
      }));
  }
  const examples = candidates
    .slice()
    .sort((a, b) => String(b.control.lastSeenAt).localeCompare(String(a.control.lastSeenAt)))
    .slice(0, MAX_EXAMPLES);
  return { facets, examples };
}

function deriveSelectedWindow(session, time, nowMs) {
  if (time.explicit) {
    const range = session.observation?.eventTimeRange;
    const eventSince = range ? parseIsoInstant(range.since) : null;
    const eventUntil = range ? parseIsoInstant(range.until) : null;
    if (isTimeRelevant(session) && eventSince != null && eventUntil != null) {
      const sinceMs = Math.max(time.sinceMs, eventSince);
      const untilMs = Math.min(time.untilMs, eventUntil);
      if (sinceMs <= untilMs) {
        return { sinceMs, untilMs, timeBasis: 'event', source: 'intersection' };
      }
    }
    return {
      sinceMs: time.sinceMs,
      untilMs: time.untilMs,
      timeBasis: 'event',
      source: time.source,
    };
  }
  if (session.connectionState === 'stale') {
    const untilIso = session.observation?.eventTimeRange?.until;
    const untilMs = untilIso ? parseIsoInstant(untilIso) : nowMs;
    const bound = untilMs == null ? nowMs : untilMs;
    return {
      sinceMs: bound - TEN_MIN_MS,
      untilMs: bound,
      timeBasis: 'event',
      source: 'stale-default',
    };
  }
  return {
    sinceMs: nowMs - TEN_MIN_MS,
    untilMs: nowMs,
    timeBasis: 'event',
    source: 'active-default',
  };
}

function toInvalidResult(parsed) {
  return {
    kind: 'invalid',
    message: parsed.message,
    attempted: [{ field: parsed.field || 'time', message: parsed.message }],
  };
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

function collectRows(hubs) {
  const rows = [];
  for (const hub of hubs || []) {
    for (const app of hub.apps || []) {
      const sessions = app.sessions || [];
      if (sessions.length === 0) {
        rows.push({
          hub: hub.endpoint,
          appId: app.appId,
          session: null,
        });
      }
      for (const session of sessions) {
        rows.push({ hub: hub.endpoint, appId: app.appId, session });
      }
    }
  }
  return rows;
}

function uniquePairs(rows) {
  const seen = new Set();
  for (const row of rows) {
    seen.add(`${row.hub}\0${row.appId}`);
  }
  return seen.size;
}

function finalizeCandidates(rows, resumeState, time, nowMs) {
  const built = rows.map((row) => {
    const made = makeFinalTargetCandidate(
      { endpoint: row.hub, appId: row.appId, session: row.session },
      resumeState,
    );
    return { ...made, row };
  });
  if (built.length === 1) {
    const only = built[0];
    const window = deriveSelectedWindow(only.row.session, time, nowMs);
    return {
      kind: 'selected',
      target: only.candidate,
      window,
      nextState: only.nextState,
    };
  }
  if (built.length <= MAX_SELECTION) {
    return {
      kind: 'selection',
      candidates: built.map((item) => item.candidate),
      total: built.length,
    };
  }
  const candidates = built.map((item) => item.candidate);
  const summary = buildCandidateSummary(candidates);
  return {
    kind: 'fact',
    reasonCode: 'candidate_budget_exceeded',
    window: time,
    candidates,
    facets: summary.facets,
    examples: summary.examples,
    attempted: [],
  };
}

function resolveDiagnoseTarget({ hubs, options = {}, resumeState, nowMs }) {
  const state = resumeState || createResumeState(options);
  const timeParse = parseDiagnoseTime(effectiveTimeOptions(options, state), nowMs);
  if (!timeParse.ok) {
    return toInvalidResult(timeParse);
  }

  const explicitHub = state.selected.hub || options.hub || state.discovery.explicitHub || null;
  const explicitApp = state.selected.appId || options.appId || state.discovery.appId || null;
  const explicitSession = state.sessionReleasedForCapture
    ? (state.selected.sessionId || null)
    : (state.selected.sessionId || options.session || state.discovery.sessionId || null);
  const allowStale = Boolean(
    options.allowStale || options.preferStale || state.stale.allow || state.stale.prefer,
  );
  const preferStale = Boolean(options.preferStale || state.stale.prefer);
  const targetMatchText = options.targetMatch || state.targetMatch || null;
  const confirmTargetUsed = Boolean(state.targetConfirmationUsed);

  let rows = collectRows(hubs);
  if (explicitHub) {
    rows = rows.filter((row) => row.hub === explicitHub);
  }
  if (explicitApp) {
    rows = rows.filter((row) => row.appId === explicitApp);
  }

  const appRows = rows;
  if (appRows.length === 0) {
    return {
      kind: 'fact',
      reasonCode: 'no_app',
      window: timeParse,
      candidates: [],
      facets: {},
      examples: [],
      attempted: [],
    };
  }

  const sessionRows = appRows.filter((row) => row.session);
  if (sessionRows.length === 0) {
    return {
      kind: 'fact',
      reasonCode: 'no_session',
      window: timeParse,
      candidates: [],
      facets: {},
      examples: [],
      attempted: [],
    };
  }

  if (explicitSession) {
    const owned = sessionRows.filter((row) => row.session.sessionId === explicitSession);
    if (owned.length === 0) {
      return {
        kind: 'fact',
        reasonCode: 'no_session',
        window: timeParse,
        candidates: [],
        facets: {},
        examples: [],
        attempted: [],
      };
    }
    rows = owned;
  } else {
    rows = sessionRows;
  }

  if (uniquePairs(rows) > 1) {
    if (timeParse.explicit) {
      const relevantHubs = new Set(rows.filter((row) => isTimeRelevant(row.session)).map((row) => row.hub));
      if (relevantHubs.size === 1) {
        const hub = [...relevantHubs][0];
        rows = rows.filter((row) => row.hub === hub);
      } else if (relevantHubs.size > 1) {
        rows = rows.filter((row) => relevantHubs.has(row.hub));
      }
    } else {
      const activeHubs = new Set(
        rows.filter((row) => row.session.connectionState === 'active').map((row) => row.hub),
      );
      if (activeHubs.size === 1) {
        const hub = [...activeHubs][0];
        rows = rows.filter((row) => row.hub === hub);
      }
    }
  }

  if (targetMatchText) {
    const validated = validateTargetMatchInput(targetMatchText);
    if (!validated.ok) {
      return toInvalidResult(validated);
    }
    let pool = rows;
    if (timeParse.explicit || confirmTargetUsed) {
      const relevant = pool.filter((row) => isTimeRelevant(row.session));
      if (relevant.length > 0) {
        pool = relevant;
      }
    }
    const matched = pool.filter((row) => rowMatchesTokens(row, validated.tokens));
    if (confirmTargetUsed || state.attempts.CONFIRM_TARGET >= 1) {
      if (matched.length !== 1) {
        return {
          kind: 'terminal',
          code: 'TARGET_AMBIGUOUS',
          message: 'Target match did not identify a unique Session',
          attempted: buildMatchAttempted(validated.tokens, matched.length === 1 ? 0 : matched.length),
        };
      }
      rows = matched;
    } else if (matched.length === 1) {
      rows = matched;
    } else {
      return {
        kind: 'terminal',
        code: 'TARGET_AMBIGUOUS',
        message: 'Target match did not identify a unique Session',
        attempted: buildMatchAttempted(validated.tokens, matched.length),
      };
    }
  }

  if (timeParse.explicit && !explicitSession) {
    const relevant = rows.filter((row) => isTimeRelevant(row.session));
    if (relevant.length > 0) {
      rows = relevant;
    } else if (rows.every((row) => !hasRetainedEvents(row.session))) {
      return {
        kind: 'fact',
        reasonCode: 'empty_session',
        window: timeParse,
        candidates: [],
        facets: {},
        examples: [],
        attempted: [],
      };
    } else {
      const nearest = rows
        .slice()
        .sort((a, b) => distanceToWindow(a.session, timeParse) - distanceToWindow(b.session, timeParse))
        .slice(0, MAX_NEAREST);
      const candidates = nearest.map((row) => makeFinalTargetCandidate(
        { endpoint: row.hub, appId: row.appId, session: row.session },
        state,
      ).candidate);
      return {
        kind: 'fact',
        reasonCode: 'no_time_overlap',
        window: timeParse,
        candidates,
        facets: {},
        examples: [],
        attempted: [{
          window: {
            since: toIsoInstant(timeParse.sinceMs),
            until: toIsoInstant(timeParse.untilMs),
          },
          candidateCount: rows.length,
        }],
      };
    }
  }

  if (!timeParse.explicit) {
    const staleRows = rows.filter((row) => row.session.connectionState === 'stale');
    const activeRows = rows.filter((row) => row.session.connectionState === 'active');
    if (preferStale) {
      rows = staleRows.length > 0 ? staleRows : activeRows;
    } else if (activeRows.length > 0) {
      rows = activeRows;
    } else if (staleRows.length > 0) {
      if (!allowStale) {
        return {
          kind: 'fact',
          reasonCode: 'only_stale',
          window: timeParse,
          candidates: [],
          facets: {},
          examples: [],
          attempted: [],
        };
      }
      rows = staleRows;
    }
  }

  if (rows.length === 1 && !timeParse.explicit && !explicitSession) {
    const session = rows[0].session;
    if (!hasRetainedEvents(session) || !isTimeRelevant(session)) {
      return {
        kind: 'fact',
        reasonCode: session.syncState === 'paused' ? 'paused_empty' : 'empty_session',
        window: timeParse,
        candidates: [],
        facets: {},
        examples: [],
        attempted: [],
      };
    }
  }

  if (rows.length === 1 && !timeParse.explicit && explicitSession) {
    const session = rows[0].session;
    if (!isTimeRelevant(session)) {
      return {
        kind: 'fact',
        reasonCode: session.syncState === 'paused' ? 'paused_empty' : 'empty_session',
        window: timeParse,
        candidates: [],
        facets: {},
        examples: [],
        attempted: [],
      };
    }
  }

  return finalizeCandidates(rows, state, timeParse, nowMs);
}

module.exports = {
  parseDiagnoseTime,
  tokenizeTargetMatch,
  makeFinalTargetCandidate,
  resolveDiagnoseTarget,
  buildCandidateSummary,
  pickDisplayDeviceFields,
  escapeDisplayLabel,
};
