'use strict';

const crypto = require('crypto');
const {
  DIAGNOSE_DEFINITIONS,
  CAPTURE_STEPS,
  CAPTURE_OUTCOMES,
} = require('./diagnoseResultSchema');
const { parseIsoInstant, toIsoInstant, isValidTimestampMs } = require('../protocol/time');

const TOKEN_VERSION = 1;
const PREFIX = Object.freeze(['npx', '--no-install', 'debug-toolkit', 'diagnose']);
const VALUE_FLAGS = Object.freeze([
  '--hub', '--endpoint', '--app-id', '--session', '--at', '--since', '--until', '--target-match',
]);
const BOOL_FLAGS = Object.freeze(['--allow-stale', '--prefer-stale']);
const ACTION_NAMES = Object.freeze(Object.keys(DIAGNOSE_DEFINITIONS.ACTION_DEFS));

const EMPTY_ATTEMPTS = Object.freeze({
  LOCAL_HUB_NOT_RUNNING: 0,
  CAPTURE_LOGS: 0,
  ALLOW_STALE: 0,
  CONFIRM_TIME: 0,
  CONFIRM_TARGET: 0,
  CONNECT_HUB: 0,
});

const MISSING_SESSION_AUTH = Object.freeze({ __diagnoseAuth: 'missing-session' });
const EVIDENCE_PROJECTION_AUTH = Object.freeze({ __diagnoseAuth: 'evidence-projection' });

const MAX_TARGET_MATCH_CHARS = 512;
const MAX_TARGET_TOKENS = 32;
const MAX_TOKEN_CHARS = 128;
const MAX_ENDPOINT = 512;
const FIVE_MIN_MS = 5 * 60 * 1000;

function fail(message, code = 'INVALID_ARGUMENT') {
  return { ok: false, code, message };
}

function ok(state) {
  return { ok: true, state };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortedStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => sortedStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${sortedStringify(value[key])}`).join(',')}}`;
}

function normalizeHub(value, fieldName) {
  if (value == null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ENDPOINT) {
    return fail(`${fieldName} must be a bounded Hub URL`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_err) {
    return fail(`${fieldName} must be an absolute URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail(`${fieldName} must use http or https`);
  }
  const normalized = value.endsWith('/') ? value.slice(0, -1) : value;
  return { ok: true, value: normalized };
}

function normalizeId(value, fieldName) {
  if (value == null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string' || value.length > 256) {
    return fail(`${fieldName} invalid`);
  }
  return { ok: true, value };
}

function tokenizeTargetMatch(text) {
  return text
    .split(/[\s\p{P}\p{S}]+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLocaleLowerCase());
}

function validateTargetMatch(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return fail('target match must be a non-empty string');
  }
  if (text.length > MAX_TARGET_MATCH_CHARS) {
    return fail('target match exceeds 512 characters');
  }
  const tokens = tokenizeTargetMatch(text);
  if (tokens.length === 0) {
    return fail('target match produced no tokens');
  }
  if (tokens.length > MAX_TARGET_TOKENS) {
    return fail('target match exceeds 32 tokens');
  }
  for (const token of tokens) {
    if (token.length > MAX_TOKEN_CHARS) {
      return fail('target match token exceeds 128 characters');
    }
  }
  return { ok: true, value: text, tokens };
}

function effectiveWindowMs(time) {
  if (!time || time.kind === 'none') {
    return null;
  }
  if (time.kind === 'at') {
    const at = parseIsoInstant(time.at);
    if (at == null) {
      return null;
    }
    return { sinceMs: at - FIVE_MIN_MS, untilMs: at + FIVE_MIN_MS, durationMs: 10 * 60 * 1000 };
  }
  if (time.kind === 'range') {
    const sinceMs = parseIsoInstant(time.since);
    const untilMs = parseIsoInstant(time.until);
    if (sinceMs == null || untilMs == null || sinceMs > untilMs) {
      return null;
    }
    return { sinceMs, untilMs, durationMs: untilMs - sinceMs };
  }
  return null;
}

function isSubsetWindow(inner, outer) {
  return inner.sinceMs >= outer.sinceMs && inner.untilMs <= outer.untilMs;
}

function parseTimeFromOptions(options) {
  if (options.at) {
    if (options.since || options.until) {
      return fail('at and since/until are mutually exclusive');
    }
    if (parseIsoInstant(options.at) == null) {
      return fail('at must be a strict offset-bearing ISO instant');
    }
    return { ok: true, time: { kind: 'at', at: options.at, confirmationUsed: false } };
  }
  if (options.since || options.until) {
    if (!options.since || !options.until) {
      return fail('since and until must both be provided');
    }
    const sinceMs = parseIsoInstant(options.since);
    const untilMs = parseIsoInstant(options.until);
    if (sinceMs == null || untilMs == null) {
      return fail('since/until must be strict offset-bearing ISO instants');
    }
    if (sinceMs > untilMs) {
      return fail('since must be <= until');
    }
    return {
      ok: true,
      time: {
        kind: 'range',
        since: options.since,
        until: options.until,
        confirmationUsed: false,
      },
    };
  }
  return { ok: true, time: null };
}

function createResumeState(options = {}) {
  const time = options.at
    ? { kind: 'at', at: options.at, confirmationUsed: false }
    : options.since && options.until
      ? { kind: 'range', since: options.since, until: options.until, confirmationUsed: false }
      : { kind: 'none', confirmationUsed: false };
  return {
    version: TOKEN_VERSION,
    discovery: {
      explicitHub: options.hub || null,
      projectEndpoint: options.endpoint || null,
      appId: options.appId || null,
      sessionId: options.session || null,
    },
    time,
    stale: {
      allow: Boolean(options.allowStale || options.preferStale),
      prefer: Boolean(options.preferStale),
    },
    selected: { hub: null, appId: null, sessionId: null },
    targetMatch: null,
    targetConfirmationUsed: false,
    sessionReleasedForCapture: false,
    attempts: { ...EMPTY_ATTEMPTS },
    capture: { completed: [] },
  };
}

function validateResumeState(state) {
  if (!isPlainObject(state)) {
    return fail('resume state must be an object');
  }
  const allowedTop = [
    'version', 'discovery', 'time', 'stale', 'selected', 'targetMatch',
    'targetConfirmationUsed', 'sessionReleasedForCapture', 'attempts', 'capture',
  ];
  for (const key of Object.keys(state)) {
    if (!allowedTop.includes(key)) {
      return fail(`unknown resume state key ${key}`);
    }
  }
  for (const key of allowedTop) {
    if (!Object.prototype.hasOwnProperty.call(state, key)) {
      return fail(`missing resume state key ${key}`);
    }
  }
  if (state.version !== TOKEN_VERSION) {
    return fail('unknown token version');
  }
  if (!isPlainObject(state.discovery)
    || !isPlainObject(state.time)
    || !isPlainObject(state.stale)
    || !isPlainObject(state.selected)
    || !isPlainObject(state.attempts)
    || !isPlainObject(state.capture)
    || !Array.isArray(state.capture.completed)) {
    return fail('resume state nested shape invalid');
  }

  for (const field of ['explicitHub', 'projectEndpoint']) {
    const normalized = normalizeHub(state.discovery[field], `discovery.${field}`);
    if (!normalized.ok) {
      return normalized;
    }
  }
  for (const field of ['appId', 'sessionId']) {
    const normalized = normalizeId(state.discovery[field], `discovery.${field}`);
    if (!normalized.ok) {
      return normalized;
    }
  }

  const selectedHub = normalizeHub(state.selected.hub, 'selected.hub');
  if (!selectedHub.ok) {
    return selectedHub;
  }
  for (const field of ['appId', 'sessionId']) {
    const normalized = normalizeId(state.selected[field], `selected.${field}`);
    if (!normalized.ok) {
      return normalized;
    }
  }

  if (typeof state.stale.allow !== 'boolean' || typeof state.stale.prefer !== 'boolean') {
    return fail('stale flags must be boolean');
  }
  if (typeof state.targetConfirmationUsed !== 'boolean'
    || typeof state.sessionReleasedForCapture !== 'boolean') {
    return fail('confirmation flags must be boolean');
  }

  if (state.time.kind === 'none') {
    if (state.time.confirmationUsed !== true && state.time.confirmationUsed !== false) {
      return fail('time.confirmationUsed must be boolean');
    }
  } else if (state.time.kind === 'at') {
    if (parseIsoInstant(state.time.at) == null) {
      return fail('time.at invalid');
    }
  } else if (state.time.kind === 'range') {
    if (parseIsoInstant(state.time.since) == null || parseIsoInstant(state.time.until) == null) {
      return fail('time range invalid');
    }
    if (parseIsoInstant(state.time.since) > parseIsoInstant(state.time.until)) {
      return fail('time range inverted');
    }
  } else {
    return fail('time.kind invalid');
  }

  for (const name of ACTION_NAMES) {
    if (!Number.isInteger(state.attempts[name]) || state.attempts[name] < 0) {
      return fail(`attempts.${name} must be a nonnegative integer`);
    }
  }
  for (const key of Object.keys(state.attempts)) {
    if (!ACTION_NAMES.includes(key)) {
      return fail(`unknown attempt key ${key}`);
    }
  }

  if (state.targetMatch != null) {
    const match = validateTargetMatch(state.targetMatch);
    if (!match.ok) {
      return match;
    }
  }

  const seenSteps = new Set();
  for (const item of state.capture.completed) {
    if (!isPlainObject(item) || typeof item.step !== 'string' || typeof item.outcome !== 'string') {
      return fail('capture.completed entries invalid');
    }
    if (!CAPTURE_STEPS.includes(item.step) || !CAPTURE_OUTCOMES.includes(item.outcome)) {
      return fail('capture.completed step/outcome invalid');
    }
    if (seenSteps.has(item.step)) {
      return fail('duplicate capture step');
    }
    seenSteps.add(item.step);
  }

  return ok(state);
}

function encodeResumeToken(state) {
  const validation = validateResumeState(state);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  const payload = Buffer.from(sortedStringify(state), 'utf8').toString('base64url');
  const checksum = crypto.createHash('sha256').update(payload, 'utf8').digest('base64url');
  return `v${TOKEN_VERSION}.${payload}.${checksum}`;
}

function decodeResumeToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return fail('resume token must be a string');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return fail('resume token format invalid');
  }
  const [versionPart, payload, checksum] = parts;
  if (!/^v\d+$/.test(versionPart)) {
    return fail('resume token version invalid');
  }
  const version = Number(versionPart.slice(1));
  if (version !== TOKEN_VERSION) {
    return fail('unknown token version');
  }
  const expected = crypto.createHash('sha256').update(payload, 'utf8').digest('base64url');
  if (checksum !== expected) {
    return fail('resume token checksum mismatch');
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_err) {
    return fail('resume token payload is not JSON');
  }
  return validateResumeState(parsed);
}

function projectVisible(state) {
  const hub = state.selected.hub || state.discovery.explicitHub || null;
  const endpoint = state.selected.hub ? null : state.discovery.projectEndpoint;
  const appId = state.selected.appId || state.discovery.appId || null;
  const sessionId = state.sessionReleasedForCapture
    ? (state.selected.sessionId || null)
    : (state.selected.sessionId || state.discovery.sessionId || null);
  return {
    hub,
    endpoint,
    appId,
    sessionId,
    time: state.time,
    allowStale: state.stale.allow,
    preferStale: state.stale.prefer,
  };
}

function buildResumeArgs(state, { omitTime = false } = {}) {
  const validation = validateResumeState(state);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  const args = [...PREFIX];
  const visible = projectVisible(state);
  if (visible.hub) {
    args.push('--hub', visible.hub);
  }
  if (visible.endpoint) {
    args.push('--endpoint', visible.endpoint);
  }
  if (visible.appId) {
    args.push('--app-id', visible.appId);
  }
  if (visible.sessionId) {
    args.push('--session', visible.sessionId);
  }
  if (!omitTime) {
    if (state.time.kind === 'at') {
      args.push('--at', state.time.at);
    } else if (state.time.kind === 'range') {
      args.push('--since', state.time.since, '--until', state.time.until);
    }
  }
  if (state.stale.prefer) {
    args.push('--prefer-stale');
  } else if (state.stale.allow) {
    args.push('--allow-stale');
  }
  args.push('--resume-token', encodeResumeToken(state));
  return args;
}

function parseArgvFlags(args) {
  if (!Array.isArray(args)) {
    return fail('argv must be an array');
  }
  for (let i = 0; i < PREFIX.length; i += 1) {
    if (args[i] !== PREFIX[i]) {
      return fail('argv must begin with npx --no-install debug-toolkit diagnose');
    }
  }
  const values = Object.create(null);
  const bools = Object.create(null);
  let resumeToken = null;
  let i = PREFIX.length;
  while (i < args.length) {
    const flag = args[i];
    if (flag === '--resume-token') {
      if (resumeToken != null) {
        return fail('duplicate --resume-token');
      }
      if (i + 1 >= args.length) {
        return fail('missing --resume-token value');
      }
      resumeToken = args[i + 1];
      if (i + 2 !== args.length) {
        return fail('--resume-token must be the final flag');
      }
      i += 2;
      continue;
    }
    if (BOOL_FLAGS.includes(flag)) {
      if (bools[flag]) {
        return fail(`duplicate ${flag}`);
      }
      bools[flag] = true;
      i += 1;
      continue;
    }
    if (VALUE_FLAGS.includes(flag)) {
      if (flag === '--target-match') {
        return fail('continuation argv must not emit --target-match');
      }
      if (Object.prototype.hasOwnProperty.call(values, flag)) {
        return fail(`duplicate ${flag}`);
      }
      if (i + 1 >= args.length || String(args[i + 1]).startsWith('--')) {
        return fail(`missing value for ${flag}`);
      }
      values[flag] = args[i + 1];
      i += 2;
      continue;
    }
    return fail(`unknown or illegal flag ${flag}`);
  }
  if (resumeToken == null) {
    return fail('missing --resume-token');
  }
  return { ok: true, values, bools, resumeToken };
}

function validateContinuationArgv(args, { purposeState, purposeCode } = {}) {
  const parsed = parseArgvFlags(args);
  if (!parsed.ok) {
    return { ok: false, errors: [parsed.message] };
  }
  const decoded = decodeResumeToken(parsed.resumeToken);
  if (!decoded.ok) {
    return { ok: false, errors: [decoded.message] };
  }
  const projected = projectVisible(decoded.state);
  const errors = [];

  const expectEq = (flag, expected) => {
    const actual = parsed.values[flag];
    if (expected == null) {
      if (actual != null) {
        errors.push(`${flag} must be absent`);
      }
      return;
    }
    if (actual !== expected) {
      errors.push(`${flag} must equal token projection`);
    }
  };

  expectEq('--hub', projected.hub);
  expectEq('--endpoint', projected.endpoint);
  expectEq('--app-id', projected.appId);
  expectEq('--session', projected.sessionId);

  const allowOmitTime = purposeCode === 'CONFIRM_TIME'
    || purposeCode === 'CONFIRM_TARGET'
    || purposeState === 'evidence_ready';

  if (projected.time.kind === 'at') {
    if (parsed.values['--at'] == null) {
      if (!allowOmitTime) {
        errors.push('visible --at required');
      }
    } else if (parsed.values['--at'] !== projected.time.at) {
      errors.push('visible --at must match token');
    }
    if (parsed.values['--since'] != null || parsed.values['--until'] != null) {
      errors.push('range flags illegal for at projection');
    }
  } else if (projected.time.kind === 'range') {
    if (parsed.values['--since'] == null || parsed.values['--until'] == null) {
      if (!allowOmitTime) {
        errors.push('visible --since/--until required');
      }
    } else if (
      parsed.values['--since'] !== projected.time.since
      || parsed.values['--until'] !== projected.time.until
    ) {
      errors.push('visible range must match token');
    }
    if (parsed.values['--at'] != null) {
      errors.push('at flag illegal for range projection');
    }
  } else if (parsed.values['--at'] || parsed.values['--since'] || parsed.values['--until']) {
    errors.push('time flags illegal when token has no time');
  }

  const expectAllow = projected.preferStale ? false : projected.allowStale;
  const expectPrefer = projected.preferStale;
  if (Boolean(parsed.bools['--prefer-stale']) !== expectPrefer) {
    errors.push('--prefer-stale projection mismatch');
  }
  if (Boolean(parsed.bools['--allow-stale']) !== expectAllow) {
    // prefer implies allow in state but visible prefer replaces allow flag
    if (!(expectPrefer && !parsed.bools['--allow-stale'])) {
      errors.push('--allow-stale projection mismatch');
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function deriveResumeState(previous, transition = {}) {
  const base = validateResumeState(previous);
  if (!base.ok) {
    return base;
  }
  const allowed = [
    'select', 'incrementAction', 'completeCaptureStep', 'allowStale', 'setTargetMatch',
    'narrowTime', 'replaceTimeAfterConfirmation', 'releaseSessionForCapture', 'bindEvidenceWindow',
  ];
  for (const key of Object.keys(transition)) {
    if (!allowed.includes(key)) {
      return fail(`unknown transition key ${key}`);
    }
  }

  const next = structuredClone(previous);

  if (transition.select) {
    const select = transition.select;
    if (!isPlainObject(select)) {
      return fail('select must be an object');
    }
    const hub = normalizeHub(select.hub, 'select.hub');
    const appId = normalizeId(select.appId, 'select.appId');
    const sessionId = normalizeId(select.sessionId, 'select.sessionId');
    if (!hub.ok) {
      return hub;
    }
    if (!appId.ok) {
      return appId;
    }
    if (!sessionId.ok) {
      return sessionId;
    }
    if (!hub.value || !appId.value) {
      return fail('select requires hub and appId');
    }
    if (next.selected.hub && next.selected.hub !== hub.value) {
      return fail('cannot change selected hub');
    }
    if (next.selected.appId && next.selected.appId !== appId.value) {
      return fail('cannot change selected appId');
    }
    if (next.selected.sessionId
      && sessionId.value
      && next.selected.sessionId !== sessionId.value
      && !next.sessionReleasedForCapture) {
      return fail('cannot change selected sessionId');
    }
    if (next.sessionReleasedForCapture
      && next.selected.sessionId
      && sessionId.value
      && next.selected.sessionId !== sessionId.value) {
      return fail('cannot replace session after release without cleared selection');
    }
    // After release, selected.sessionId is null; resolver may set one new session.
    next.selected = {
      hub: hub.value,
      appId: appId.value,
      sessionId: sessionId.value,
    };
  }

  if (transition.incrementAction) {
    if (!ACTION_NAMES.includes(transition.incrementAction)) {
      return fail('incrementAction unknown');
    }
    next.attempts[transition.incrementAction] += 1;
  }

  if (transition.completeCaptureStep) {
    const step = transition.completeCaptureStep.step;
    const outcome = transition.completeCaptureStep.outcome;
    if (!CAPTURE_STEPS.includes(step) || !CAPTURE_OUTCOMES.includes(outcome)) {
      return fail('completeCaptureStep invalid');
    }
    if (next.capture.completed.some((item) => item.step === step)) {
      return fail('duplicate capture step');
    }
    next.capture.completed.push({ step, outcome });
  }

  if (transition.allowStale) {
    next.stale.allow = true;
  }

  if (Object.prototype.hasOwnProperty.call(transition, 'setTargetMatch')) {
    const match = validateTargetMatch(transition.setTargetMatch);
    if (!match.ok) {
      return match;
    }
    next.targetMatch = match.value;
  }

  if (transition.releaseSessionForCapture) {
    const auth = transition.releaseSessionForCapture;
    if (auth !== MISSING_SESSION_AUTH && auth?.__diagnoseAuth !== 'missing-session') {
      return fail('releaseSessionForCapture requires trusted authorization');
    }
    if (!next.selected.hub || !next.selected.appId || !next.selected.sessionId) {
      return fail('releaseSessionForCapture requires selected hub/app/session');
    }
    next.selected.sessionId = null;
    next.discovery.sessionId = null;
    next.sessionReleasedForCapture = true;
  }

  if (transition.bindEvidenceWindow) {
    const bind = transition.bindEvidenceWindow;
    if (bind.auth !== EVIDENCE_PROJECTION_AUTH && bind.auth?.__diagnoseAuth !== 'evidence-projection') {
      return fail('bindEvidenceWindow requires trusted evidence projection');
    }
    if (!isValidTimestampMs(bind.sinceMs) || !isValidTimestampMs(bind.untilMs) || bind.sinceMs > bind.untilMs) {
      return fail('bindEvidenceWindow bounds invalid');
    }
    const bound = {
      sinceMs: bind.sinceMs,
      untilMs: bind.untilMs,
      durationMs: bind.untilMs - bind.sinceMs,
    };
    const current = effectiveWindowMs(next.time);
    if (current && !isSubsetWindow(bound, current)) {
      return fail('bindEvidenceWindow cannot widen explicit time');
    }
    next.time = {
      kind: 'range',
      since: toIsoInstant(bind.sinceMs),
      until: toIsoInstant(bind.untilMs),
      confirmationUsed: next.time.confirmationUsed,
    };
  }

  if (transition.narrowTime) {
    const narrow = transition.narrowTime;
    const nextTime = { ...narrow, confirmationUsed: next.time.confirmationUsed };
    const inner = effectiveWindowMs(nextTime);
    const outer = effectiveWindowMs(next.time);
    if (!inner) {
      return fail('narrowTime invalid');
    }
    if (outer && !isSubsetWindow(inner, outer)) {
      return fail('narrowTime cannot widen window');
    }
    next.time = nextTime;
  }

  if (transition.replaceTimeAfterConfirmation) {
    if (next.attempts.CONFIRM_TIME !== 1 || next.time.confirmationUsed === true) {
      return fail('replaceTimeAfterConfirmation not authorized');
    }
    const replacement = {
      ...transition.replaceTimeAfterConfirmation,
      confirmationUsed: true,
    };
    const nextWindow = effectiveWindowMs(replacement);
    const prevWindow = effectiveWindowMs(next.time);
    if (!nextWindow || !prevWindow) {
      return fail('replaceTimeAfterConfirmation requires explicit windows');
    }
    if (nextWindow.durationMs > prevWindow.durationMs) {
      return fail('replacement duration cannot exceed previous window');
    }
    next.time = replacement;
  }

  return validateResumeState(next);
}

function mergeResumeOptions(state, options = {}) {
  const base = validateResumeState(state);
  if (!base.ok) {
    return base;
  }
  const next = structuredClone(state);

  if (options.hub != null) {
    const hub = normalizeHub(options.hub, 'hub');
    if (!hub.ok) {
      return hub;
    }
    const bound = next.selected.hub || next.discovery.explicitHub;
    if (bound && hub.value !== bound) {
      return fail('argv cannot switch Hub bound by token');
    }
    if (!next.selected.hub) {
      next.discovery.explicitHub = hub.value;
    }
  }

  if (options.endpoint != null) {
    const endpoint = normalizeHub(options.endpoint, 'endpoint');
    if (!endpoint.ok) {
      return endpoint;
    }
    if (next.selected.hub) {
      return fail('argv cannot reopen discovery endpoint after Hub selection');
    }
    if (next.discovery.projectEndpoint && endpoint.value !== next.discovery.projectEndpoint) {
      return fail('argv cannot change project endpoint bound by token');
    }
    next.discovery.projectEndpoint = endpoint.value;
  }

  if (options.appId != null) {
    if (next.selected.appId && options.appId !== next.selected.appId) {
      return fail('argv cannot change selected App');
    }
    if (next.selected.appId) {
      // ignore identical
    } else if (next.discovery.appId && options.appId !== next.discovery.appId) {
      return fail('argv cannot change discovery App bound by token');
    } else {
      next.discovery.appId = options.appId;
    }
  }

  if (options.session != null) {
    if (next.selected.sessionId && options.session !== next.selected.sessionId) {
      return fail('argv cannot change selected Session');
    }
    if (next.selected.hub || next.selected.appId || next.selected.sessionId) {
      if (next.selected.sessionId == null && next.sessionReleasedForCapture) {
        return fail('argv cannot set Session after release; resolver select required');
      }
      if (next.selected.sessionId && options.session === next.selected.sessionId) {
        // ok
      } else if (next.selected.sessionId) {
        return fail('argv cannot change selected Session');
      } else {
        return fail('argv cannot set selected Session');
      }
    } else if (next.discovery.sessionId && options.session !== next.discovery.sessionId) {
      return fail('argv cannot change discovery Session bound by token');
    } else {
      next.discovery.sessionId = options.session;
    }
  }

  if (options.allowStale || options.preferStale) {
    if (options.preferStale) {
      next.stale.prefer = true;
      next.stale.allow = true;
    } else if (options.allowStale) {
      if (next.stale.allow === false) {
        next.stale.allow = true;
      }
    }
  }
  // disallow clearing stale
  if (options.allowStale === false && next.stale.allow === true) {
    return fail('--allow-stale may only change false to true');
  }

  const timeParse = parseTimeFromOptions(options);
  if (!timeParse.ok) {
    return timeParse;
  }

  const hasTargetMatch = options.targetMatch != null && options.targetMatch !== '';
  const hasTime = timeParse.time != null;

  if (next.attempts.CONFIRM_TARGET === 1 && !next.targetConfirmationUsed) {
    if (!hasTargetMatch && !hasTime) {
      return fail('CONFIRM_TARGET continuation requires target match and/or time');
    }
    if (hasTargetMatch) {
      const match = validateTargetMatch(options.targetMatch);
      if (!match.ok) {
        return match;
      }
      next.targetMatch = match.value;
    }
    if (hasTime) {
      const current = effectiveWindowMs(next.time);
      if (current) {
        const inner = effectiveWindowMs(timeParse.time);
        if (!inner || !isSubsetWindow(inner, current)) {
          return fail('CONFIRM_TARGET time refinement must be a subset');
        }
        next.time = { ...timeParse.time, confirmationUsed: next.time.confirmationUsed };
      } else if (next.time.kind === 'none') {
        next.time = { ...timeParse.time, confirmationUsed: false };
      }
    }
    next.targetConfirmationUsed = true;
    return validateResumeState(next);
  }

  if (next.targetConfirmationUsed && (hasTargetMatch || hasTime)) {
    // further target answers rejected; time may still narrow if subset
    if (hasTargetMatch) {
      return fail('target confirmation already used');
    }
  }

  if (hasTime) {
    const current = effectiveWindowMs(next.time);
    if (next.attempts.CONFIRM_TIME === 1 && next.time.confirmationUsed !== true && !next.targetConfirmationUsed) {
      // merge path for user appending corrected time after CONFIRM_TIME action emitted
      const replacement = { ...timeParse.time, confirmationUsed: true };
      const nextWindow = effectiveWindowMs(replacement);
      if (!current || !nextWindow) {
        return fail('CONFIRM_TIME replacement requires explicit windows');
      }
      if (nextWindow.durationMs > current.durationMs) {
        return fail('replacement duration cannot exceed previous window');
      }
      next.time = replacement;
    } else if (current) {
      const inner = effectiveWindowMs(timeParse.time);
      if (!inner || !isSubsetWindow(inner, current)) {
        return fail('time window may only be narrowed');
      }
      next.time = { ...timeParse.time, confirmationUsed: next.time.confirmationUsed };
    } else if (next.time.kind === 'none') {
      return fail('arbitrary time requires CONFIRM_TARGET authorization');
    }
  }

  if (hasTargetMatch && !next.targetConfirmationUsed) {
    return fail('--target-match only allowed after CONFIRM_TARGET');
  }

  return validateResumeState(next);
}

function loadAndMergeResumeState(options = {}) {
  if (options.resumeToken == null || options.resumeToken === '') {
    const created = createResumeState(options);
    const validated = validateResumeState(created);
    if (!validated.ok) {
      return validated;
    }
    return ok(created);
  }
  const decoded = decodeResumeToken(options.resumeToken);
  if (!decoded.ok) {
    return decoded;
  }
  return mergeResumeOptions(decoded.state, options);
}

module.exports = {
  TOKEN_VERSION,
  EMPTY_ATTEMPTS,
  MISSING_SESSION_AUTH,
  EVIDENCE_PROJECTION_AUTH,
  createResumeState,
  validateResumeState,
  encodeResumeToken,
  decodeResumeToken,
  mergeResumeOptions,
  loadAndMergeResumeState,
  deriveResumeState,
  buildResumeArgs,
  validateContinuationArgv,
  projectVisible,
};
