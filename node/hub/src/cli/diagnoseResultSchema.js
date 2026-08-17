'use strict';

const { isValidTimestampMs, parseIsoInstant } = require('../protocol/time');

const ACTION_DEFS = Object.freeze({
  LOCAL_HUB_NOT_RUNNING: {
    actor: 'agent-capable',
    reasons: Object.freeze(['no_usable_implicit_hub']),
    maxAttempts: 1,
  },
  CAPTURE_LOGS: {
    actor: 'user-required',
    reasons: Object.freeze(['no_app', 'no_session', 'empty_session', 'paused_empty']),
    maxAttempts: 4,
  },
  ALLOW_STALE: {
    actor: 'agent-capable',
    reasons: Object.freeze(['only_stale']),
    maxAttempts: 1,
  },
  CONFIRM_TIME: {
    actor: 'user-required',
    reasons: Object.freeze(['no_time_overlap']),
    maxAttempts: 1,
  },
  CONFIRM_TARGET: {
    actor: 'user-required',
    reasons: Object.freeze(['candidate_budget_exceeded']),
    maxAttempts: 1,
  },
  CONNECT_HUB: {
    actor: 'user-required',
    reasons: Object.freeze(['explicit_hub_unreachable', 'candidate_hub_unreachable', 'hub_not_ready']),
    maxAttempts: 1,
  },
});

const UNAVAILABLE_DEFS = Object.freeze({
  INVALID_ARGUMENT: { exitCode: 2 },
  NO_EVIDENCE: { exitCode: 3 },
  TARGET_AMBIGUOUS: { exitCode: 3 },
  TIME_UNRESOLVED: { exitCode: 3 },
  HUB_UNREACHABLE: { exitCode: 4 },
  PROTOCOL_MISMATCH: { exitCode: 4 },
  INVALID_RESPONSE: { exitCode: 5 },
});

const STATE_DEFS = Object.freeze({
  evidence_ready: Object.freeze({ code: null, exitCode: 0 }),
  selection_required: Object.freeze({ code: 'TARGET_SELECTION_REQUIRED', exitCode: 0 }),
  action_required: Object.freeze({
    codes: Object.freeze(Object.keys(ACTION_DEFS)),
    exitCode: 0,
  }),
  unavailable: Object.freeze({
    codes: Object.freeze(Object.keys(UNAVAILABLE_DEFS)),
  }),
});

const CAPTURE_STEPS = Object.freeze(['open_app', 'upload_once', 'start_live', 'reproduce_issue']);
const CAPTURE_OUTCOMES = Object.freeze(['requested', 'already_observed']);
const LOCAL_HUB_SUGGESTED_COMMAND = 'npx --no-install debug-toolkit hub dev';

const ACTION_REQUIRED_FIELDS = Object.freeze({
  LOCAL_HUB_NOT_RUNNING: Object.freeze(['retryArgs', 'suggestedCommand', 'attempted']),
  CAPTURE_LOGS: Object.freeze(['retryArgs', 'captureStep']),
  ALLOW_STALE: Object.freeze(['retryArgs']),
  CONFIRM_TIME: Object.freeze(['retryArgs', 'candidates']),
  CONFIRM_TARGET: Object.freeze(['retryArgs', 'facets', 'examples']),
  CONNECT_HUB: Object.freeze(['retryArgs', 'attempted']),
});

const HUB_ATTEMPT_KEYS = Object.freeze([
  'endpoint', 'phase', 'kind', 'code', 'httpStatus', 'appId', 'appCount', 'pageCount', 'sessionCount',
]);
const HUB_PHASES = Object.freeze(['probe', 'sessions', 'context']);
const CONNECTION_STATES = Object.freeze(['active', 'stale']);
const SYNC_STATES = Object.freeze(['live', 'paused']);

const DIAGNOSE_DEFINITIONS = Object.freeze({
  ACTION_DEFS,
  UNAVAILABLE_DEFS,
  STATE_DEFS,
  CAPTURE_STEPS,
  CAPTURE_OUTCOMES,
  ACTION_REQUIRED_FIELDS,
  LOCAL_HUB_SUGGESTED_COMMAND,
});

const MAX_CONTEXT_EVENTS = 200;
const MAX_WARNINGS = 12;
const MAX_FACET_VALUES = 8;
const MAX_EXAMPLES = 5;
const MAX_SELECTION = 20;
const MIN_SELECTION = 2;
const MAX_HUB_ATTEMPTS = 12;
const MAX_ARG_ATTEMPTS = 4;
const MAX_MATCH_TOKENS = 8;
const MAX_TOKEN_TEXT = 64;
const MAX_BOUNDED_STRING = 256;
const MAX_ARGV_STRING = 16 * 1024;
const MAX_ENDPOINT = 512;
const MAX_ENTRY_ID = 128;
const MAX_TYPE = 64;
const MAX_OBSERVED_TYPES = 64;
const MAX_LABEL = 256;
const FORBIDDEN_DUMP_KEYS = Object.freeze([
  'apps', 'body', 'responseBody', 'rawBody', 'sessions', 'devices', 'logs', 'logContent',
]);

/** @type {null | ((args: string[], opts: object) => {ok:boolean,errors?:string[]})} */
let continuationArgvValidator = null;

function getContinuationArgvValidator() {
  if (continuationArgvValidator) {
    return continuationArgvValidator;
  }
  try {
    // Lazy require avoids a CommonJS init cycle with diagnoseResumeToken (Task 2).
    // eslint-disable-next-line global-require
    const resume = require('./diagnoseResumeToken');
    if (typeof resume.validateContinuationArgv === 'function') {
      continuationArgvValidator = resume.validateContinuationArgv;
      return continuationArgvValidator;
    }
  } catch (_err) {
    // Module absent until Task 2 — Task 1 only requires string argv elements.
  }
  return null;
}

function fail(errors, message) {
  errors.push(message);
  return false;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(obj, allowed) {
  const keys = Object.keys(obj);
  if (keys.length !== allowed.length) {
    return false;
  }
  return allowed.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
}

function isBoundedString(value, max = MAX_BOUNDED_STRING) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isBoundedStringOrEmpty(value, max = MAX_BOUNDED_STRING) {
  return typeof value === 'string' && value.length <= max;
}

function isNonNegativeInt(value) {
  return Number.isInteger(value) && value >= 0;
}

function hasForbiddenDumpKeys(value, path, errors, allowUntrustedDataPath) {
  if (allowUntrustedDataPath && /\.data$/.test(path)) {
    return true;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (!hasForbiddenDumpKeys(value[i], `${path}[${i}]`, errors, allowUntrustedDataPath)) {
        return false;
      }
    }
    return true;
  }
  if (!isPlainObject(value)) {
    return true;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_DUMP_KEYS.includes(key)) {
      return fail(errors, `${path}.${key}: raw Hub/App dump fields are forbidden`);
    }
    if (!hasForbiddenDumpKeys(value[key], `${path}.${key}`, errors, allowUntrustedDataPath)) {
      return false;
    }
  }
  return true;
}

function validateStringArgv(args, path, errors) {
  if (!Array.isArray(args) || args.length === 0) {
    return fail(errors, `${path} must be a non-empty string array`);
  }
  for (let i = 0; i < args.length; i += 1) {
    if (typeof args[i] !== 'string' || args[i].length === 0 || args[i].length > MAX_ARGV_STRING) {
      return fail(errors, `${path}[${i}] must be a bounded non-empty string`);
    }
  }
  return true;
}

function validateContinuationArgvLazy(args, path, errors, purposeState, purposeCode) {
  if (!validateStringArgv(args, path, errors)) {
    return false;
  }
  const validator = getContinuationArgvValidator();
  if (!validator) {
    return true;
  }
  const result = validator(args, { purposeState, purposeCode });
  if (!result || result.ok !== true) {
    const detail = Array.isArray(result?.errors) ? result.errors.join('; ') : 'invalid continuation argv';
    return fail(errors, `${path}: ${detail}`);
  }
  return true;
}

function validateIsoBounds(since, until, path, errors) {
  const sinceMs = parseIsoInstant(since);
  const untilMs = parseIsoInstant(until);
  if (sinceMs === null || untilMs === null) {
    return fail(errors, `${path} bounds must be strict offset-bearing ISO`);
  }
  if (sinceMs > untilMs) {
    return fail(errors, `${path}.since must be <= until`);
  }
  return true;
}

function validateIsoRange(range, path, errors, { allowNull = false } = {}) {
  if (range === null) {
    return allowNull ? true : fail(errors, `${path} must be an ISO range`);
  }
  if (!isPlainObject(range) || !exactKeys(range, ['since', 'until'])) {
    return fail(errors, `${path} must be {since,until}`);
  }
  return validateIsoBounds(range.since, range.until, path, errors);
}

function validateWarning(warning, path, errors) {
  if (typeof warning === 'string') {
    return isBoundedString(warning) ? true : fail(errors, `${path} string warning out of bounds`);
  }
  if (!isPlainObject(warning)) {
    return fail(errors, `${path} must be a string or trusted summary`);
  }
  if (!exactKeys(warning, ['contentTrust', 'endpoint', 'phase', 'code'])) {
    return fail(errors, `${path} trusted warning shape invalid`);
  }
  if (warning.contentTrust !== 'trusted-control') {
    return fail(errors, `${path}.contentTrust must be trusted-control`);
  }
  if (!isBoundedString(warning.endpoint, MAX_ENDPOINT)) {
    return fail(errors, `${path}.endpoint invalid`);
  }
  if (!HUB_PHASES.includes(warning.phase)) {
    return fail(errors, `${path}.phase invalid`);
  }
  if (!isBoundedString(warning.code, 64)) {
    return fail(errors, `${path}.code invalid`);
  }
  return true;
}

function validateWarnings(warnings, path, errors) {
  if (!Array.isArray(warnings) || warnings.length > MAX_WARNINGS) {
    return fail(errors, `${path} must be an array of at most ${MAX_WARNINGS}`);
  }
  for (let i = 0; i < warnings.length; i += 1) {
    if (!validateWarning(warnings[i], `${path}[${i}]`, errors)) {
      return false;
    }
  }
  return true;
}

function validateNormalizedHub(hub, path, errors) {
  if (typeof hub !== 'string' || hub.length === 0 || hub.length > MAX_ENDPOINT) {
    return fail(errors, `${path} must be a bounded Hub string`);
  }
  let parsed;
  try {
    parsed = new URL(hub);
  } catch (_err) {
    return fail(errors, `${path} must be an absolute URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return fail(errors, `${path} must use http or https`);
  }
  if (hub.endsWith('/')) {
    return fail(errors, `${path} must be normalized without a trailing slash`);
  }
  return true;
}

function validateFinalCandidate(candidate, path, errors, purposeState, purposeCode) {
  if (!isPlainObject(candidate) || !exactKeys(candidate, ['control', 'observed', 'device', 'label'])) {
    return fail(errors, `${path} must be {control,observed,device,label}`);
  }

  const { control, observed, device, label } = candidate;
  if (!isPlainObject(control)
    || !exactKeys(control, [
      'contentTrust', 'hub', 'appId', 'sessionId', 'sourceIp',
      'connectionState', 'syncState', 'lastSeenAt', 'resumeArgs',
    ])) {
    return fail(errors, `${path}.control shape invalid`);
  }
  if (control.contentTrust !== 'trusted-control') {
    return fail(errors, `${path}.control.contentTrust invalid`);
  }
  if (!validateNormalizedHub(control.hub, `${path}.control.hub`, errors)) {
    return false;
  }
  if (!isBoundedString(control.appId, MAX_BOUNDED_STRING)
    || !isBoundedString(control.sessionId, MAX_BOUNDED_STRING)) {
    return fail(errors, `${path}.control appId/sessionId invalid`);
  }
  if (!(control.sourceIp === null || isBoundedString(control.sourceIp, 64))) {
    return fail(errors, `${path}.control.sourceIp invalid`);
  }
  if (!isBoundedString(control.connectionState, 32) || !isBoundedString(control.syncState, 32)) {
    return fail(errors, `${path}.control connection/sync invalid`);
  }
  if (!isBoundedString(control.lastSeenAt, 64) || parseIsoInstant(control.lastSeenAt) === null) {
    return fail(errors, `${path}.control.lastSeenAt must be strict ISO`);
  }
  if (!validateContinuationArgvLazy(
    control.resumeArgs,
    `${path}.control.resumeArgs`,
    errors,
    purposeState || 'selection_required',
    purposeCode || 'TARGET_SELECTION_REQUIRED',
  )) {
    return false;
  }

  if (!isPlainObject(observed)
    || !exactKeys(observed, [
      'contentTrust', 'eventTimeRange', 'receivedTimeRange', 'matchedEventCount',
    ])) {
    return fail(errors, `${path}.observed shape invalid`);
  }
  if (observed.contentTrust !== 'untrusted-structured') {
    return fail(errors, `${path}.observed.contentTrust invalid`);
  }
  if (!validateIsoRange(observed.eventTimeRange, `${path}.observed.eventTimeRange`, errors, { allowNull: true })) {
    return false;
  }
  if (!validateIsoRange(observed.receivedTimeRange, `${path}.observed.receivedTimeRange`, errors, { allowNull: true })) {
    return false;
  }
  if (!isNonNegativeInt(observed.matchedEventCount)) {
    return fail(errors, `${path}.observed.matchedEventCount invalid`);
  }

  if (!isPlainObject(device) || device.contentTrust !== 'untrusted') {
    return fail(errors, `${path}.device must set contentTrust=untrusted`);
  }
  for (const key of Object.keys(device)) {
    if (key === 'contentTrust') {
      continue;
    }
    if (!isBoundedStringOrEmpty(device[key], MAX_BOUNDED_STRING)) {
      return fail(errors, `${path}.device.${key} invalid`);
    }
  }

  if (!isPlainObject(label) || !exactKeys(label, ['contentTrust', 'text'])) {
    return fail(errors, `${path}.label shape invalid`);
  }
  if (label.contentTrust !== 'untrusted' || !isBoundedString(label.text, MAX_LABEL)) {
    return fail(errors, `${path}.label invalid`);
  }

  return true;
}

function validateContextEvent(event, path, errors) {
  if (!isPlainObject(event)) {
    return fail(errors, `${path} must be an object`);
  }
  const required = ['entryId', 'type', 'timestamp', 'receivedAt', 'data', 'preview'];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(event, key)) {
      return fail(errors, `${path} missing ${key}`);
    }
  }
  if (!isBoundedString(event.entryId, MAX_ENTRY_ID) || !isBoundedString(event.type, MAX_TYPE)) {
    return fail(errors, `${path} entryId/type invalid`);
  }
  if (!isValidTimestampMs(event.timestamp)) {
    return fail(errors, `${path}.timestamp invalid`);
  }
  if (parseIsoInstant(event.receivedAt) === null) {
    return fail(errors, `${path}.receivedAt must be strict ISO`);
  }
  if (!isPlainObject(event.preview)
    || !exactKeys(event.preview, ['contentTrust', 'isPreview', 'entryId'])) {
    return fail(errors, `${path}.preview shape invalid`);
  }
  if (event.preview.contentTrust !== 'trusted-control') {
    return fail(errors, `${path}.preview.contentTrust invalid`);
  }
  if (typeof event.preview.isPreview !== 'boolean') {
    return fail(errors, `${path}.preview.isPreview must be boolean`);
  }
  if (event.preview.isPreview) {
    if (event.preview.entryId !== event.entryId) {
      return fail(errors, `${path}.preview.entryId must equal event.entryId when isPreview`);
    }
  } else if (event.preview.entryId !== null) {
    return fail(errors, `${path}.preview.entryId must be null when not preview`);
  }
  // data is untrusted — any JSON value except using it as action payload (object/array/primitives OK)
  if (event.data === undefined) {
    return fail(errors, `${path}.data required`);
  }
  return true;
}

function validateSessionProjection(session, path, errors) {
  if (!isPlainObject(session) || !exactKeys(session, ['connectionState', 'syncState', 'warnings'])) {
    return fail(errors, `${path} must be exactly {connectionState,syncState,warnings}`);
  }
  if (!CONNECTION_STATES.includes(session.connectionState)) {
    return fail(errors, `${path}.connectionState invalid`);
  }
  if (!SYNC_STATES.includes(session.syncState)) {
    return fail(errors, `${path}.syncState invalid`);
  }
  return validateWarnings(session.warnings, `${path}.warnings`, errors);
}

function validateEvidence(result, errors) {
  if (result.code !== null) {
    return fail(errors, 'evidence_ready requires code:null');
  }
  const topKeys = Object.keys(result);
  const allowed = ['schemaVersion', 'state', 'code', 'target', 'session', 'window', 'context', 'completeness'];
  for (const key of topKeys) {
    if (!allowed.includes(key)) {
      return fail(errors, `evidence_ready forbids contract-control field ${key}`);
    }
  }
  for (const key of ['target', 'session', 'window', 'context', 'completeness']) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) {
      return fail(errors, `evidence_ready missing ${key}`);
    }
  }

  if (!validateFinalCandidate(result.target, 'target', errors, 'evidence_ready', null)) {
    return false;
  }
  if (!validateSessionProjection(result.session, 'session', errors)) {
    return false;
  }

  const { window } = result;
  if (!isPlainObject(window) || !exactKeys(window, ['since', 'until', 'timeBasis'])) {
    return fail(errors, 'window must be exactly {since,until,timeBasis}');
  }
  if (window.timeBasis !== 'event') {
    return fail(errors, 'window.timeBasis must be event');
  }
  if (!validateIsoBounds(window.since, window.until, 'window', errors)) {
    return false;
  }

  const { context } = result;
  if (!isPlainObject(context) || !exactKeys(context, ['contentTrust', 'events'])) {
    return fail(errors, 'context must be exactly {contentTrust,events}');
  }
  if (context.contentTrust !== 'untrusted') {
    return fail(errors, 'context.contentTrust must be untrusted');
  }
  if (!Array.isArray(context.events) || context.events.length > MAX_CONTEXT_EVENTS) {
    return fail(errors, `context.events must be an array of at most ${MAX_CONTEXT_EVENTS}`);
  }
  for (let i = 0; i < context.events.length; i += 1) {
    if (!validateContextEvent(context.events[i], `context.events[${i}]`, errors)) {
      return false;
    }
  }

  const { completeness } = result;
  if (!isPlainObject(completeness)) {
    return fail(errors, 'completeness must be an object');
  }
  const completenessKeys = [
    'matched', 'selected', 'omitted', 'previewed', 'observedTypes', 'totalByType',
    'syncState', 'connectionState', 'warnings', 'ranges',
  ];
  if (!exactKeys(completeness, completenessKeys)) {
    return fail(errors, 'completeness shape invalid');
  }
  for (const key of ['matched', 'selected', 'omitted', 'previewed']) {
    if (!isNonNegativeInt(completeness[key])) {
      return fail(errors, `completeness.${key} must be a nonnegative integer`);
    }
  }
  if (completeness.selected !== context.events.length) {
    return fail(errors, 'completeness.selected must equal context.events.length');
  }
  if (completeness.matched !== completeness.selected + completeness.omitted) {
    return fail(errors, 'completeness.matched must equal selected + omitted');
  }
  if (completeness.previewed > completeness.selected) {
    return fail(errors, 'completeness.previewed must be <= selected');
  }
  const previewCount = context.events.filter((event) => event.preview && event.preview.isPreview === true).length;
  if (previewCount !== completeness.previewed) {
    return fail(errors, 'completeness.previewed must equal trusted preview.isPreview count');
  }
  if (!Array.isArray(completeness.observedTypes) || completeness.observedTypes.length > MAX_OBSERVED_TYPES) {
    return fail(errors, 'completeness.observedTypes invalid');
  }
  const sorted = [...completeness.observedTypes].sort();
  for (let i = 0; i < completeness.observedTypes.length; i += 1) {
    if (completeness.observedTypes[i] !== sorted[i]) {
      return fail(errors, 'completeness.observedTypes must be sorted unique');
    }
    if (!isBoundedString(completeness.observedTypes[i], MAX_TYPE)) {
      return fail(errors, 'completeness.observedTypes entries invalid');
    }
    if (i > 0 && completeness.observedTypes[i] === completeness.observedTypes[i - 1]) {
      return fail(errors, 'completeness.observedTypes must be unique');
    }
  }
  if (!isPlainObject(completeness.totalByType)) {
    return fail(errors, 'completeness.totalByType must be an object');
  }
  let typeSum = 0;
  for (const [type, count] of Object.entries(completeness.totalByType)) {
    if (!isBoundedString(type, MAX_TYPE) || !Number.isInteger(count) || count <= 0) {
      return fail(errors, 'completeness.totalByType entries must be positive counts');
    }
    typeSum += count;
  }
  if (typeSum !== completeness.matched) {
    return fail(errors, 'completeness.totalByType counts must sum to matched');
  }
  for (const type of completeness.observedTypes) {
    if (!Object.prototype.hasOwnProperty.call(completeness.totalByType, type)) {
      return fail(errors, 'every observed type must have a positive total');
    }
  }
  for (const type of Object.keys(completeness.totalByType)) {
    if (!completeness.observedTypes.includes(type)) {
      return fail(errors, 'totalByType keys must appear in observedTypes');
    }
  }
  if (completeness.syncState !== result.session.syncState
    || completeness.connectionState !== result.session.connectionState) {
    return fail(errors, 'completeness state must equal session projection');
  }
  if (JSON.stringify(completeness.warnings) !== JSON.stringify(result.session.warnings)) {
    return fail(errors, 'completeness.warnings must equal session.warnings');
  }
  if (!isPlainObject(completeness.ranges) || !exactKeys(completeness.ranges, ['event', 'received'])) {
    return fail(errors, 'completeness.ranges must be {event,received}');
  }
  if (!validateIsoRange(completeness.ranges.event, 'completeness.ranges.event', errors, { allowNull: true })) {
    return false;
  }
  if (!validateIsoRange(completeness.ranges.received, 'completeness.ranges.received', errors, { allowNull: true })) {
    return false;
  }

  // Zero-match evidence: all zero counts, empty events/types/counts, nullable ranges OK.
  if (completeness.matched === 0) {
    if (context.events.length !== 0
      || completeness.selected !== 0
      || completeness.omitted !== 0
      || completeness.previewed !== 0
      || completeness.observedTypes.length !== 0
      || Object.keys(completeness.totalByType).length !== 0) {
      return fail(errors, 'zero-match evidence requires empty events/types/counts');
    }
  }

  return true;
}

function validateHubAttempt(attempt, path, errors) {
  if (!isPlainObject(attempt)) {
    return fail(errors, `${path} must be an object`);
  }
  for (const key of Object.keys(attempt)) {
    if (!HUB_ATTEMPT_KEYS.includes(key)) {
      return fail(errors, `${path} forbids field ${key}`);
    }
  }
  for (const key of HUB_ATTEMPT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(attempt, key)) {
      return fail(errors, `${path} missing ${key}`);
    }
  }
  if (!isBoundedString(attempt.endpoint, MAX_ENDPOINT)) {
    return fail(errors, `${path}.endpoint invalid`);
  }
  if (!HUB_PHASES.includes(attempt.phase)) {
    return fail(errors, `${path}.phase invalid`);
  }
  if (!isBoundedStringOrEmpty(attempt.kind, 64) || !isBoundedStringOrEmpty(attempt.code, 64)) {
    return fail(errors, `${path}.kind/code invalid`);
  }
  if (!(attempt.httpStatus === null || (Number.isInteger(attempt.httpStatus) && attempt.httpStatus >= 0))) {
    return fail(errors, `${path}.httpStatus invalid`);
  }
  if (!(attempt.appId === null || isBoundedString(attempt.appId))) {
    return fail(errors, `${path}.appId invalid`);
  }
  for (const countKey of ['appCount', 'pageCount', 'sessionCount']) {
    if (!isNonNegativeInt(attempt[countKey])) {
      return fail(errors, `${path}.${countKey} invalid`);
    }
  }
  return true;
}

function validateHubAttempted(attempted, path, errors) {
  if (!Array.isArray(attempted) || attempted.length > MAX_HUB_ATTEMPTS) {
    return fail(errors, `${path} must be an array of at most ${MAX_HUB_ATTEMPTS}`);
  }
  for (let i = 0; i < attempted.length; i += 1) {
    if (!validateHubAttempt(attempted[i], `${path}[${i}]`, errors)) {
      return false;
    }
  }
  return true;
}

function validateCaptureAttempted(attempted, path, errors) {
  if (!Array.isArray(attempted) || attempted.length !== CAPTURE_STEPS.length) {
    return fail(errors, `${path} must contain exactly four CaptureAttempt objects`);
  }
  const seen = new Set();
  for (let i = 0; i < attempted.length; i += 1) {
    const item = attempted[i];
    if (!isPlainObject(item) || !exactKeys(item, ['step', 'outcome'])) {
      return fail(errors, `${path}[${i}] must be {step,outcome}`);
    }
    if (item.step !== CAPTURE_STEPS[i]) {
      return fail(errors, `${path} must follow CAPTURE_STEPS order`);
    }
    if (seen.has(item.step)) {
      return fail(errors, `${path} duplicate step`);
    }
    seen.add(item.step);
    if (!CAPTURE_OUTCOMES.includes(item.outcome)) {
      return fail(errors, `${path}[${i}].outcome invalid`);
    }
  }
  return true;
}

function validateMatchAttempted(attempted, path, errors) {
  if (!Array.isArray(attempted) || attempted.length !== 1) {
    return fail(errors, `${path} must contain exactly one MatchAttempt`);
  }
  const item = attempted[0];
  if (!isPlainObject(item)
    || !exactKeys(item, ['tokens', 'matchCount', 'totalTokenCount', 'omittedTokenCount'])) {
    return fail(errors, `${path}[0] shape invalid`);
  }
  if (!Array.isArray(item.tokens) || item.tokens.length > MAX_MATCH_TOKENS) {
    return fail(errors, `${path}[0].tokens must have at most ${MAX_MATCH_TOKENS} entries`);
  }
  for (let i = 0; i < item.tokens.length; i += 1) {
    const token = item.tokens[i];
    if (!isPlainObject(token) || !exactKeys(token, ['contentTrust', 'text', 'truncated'])) {
      return fail(errors, `${path}[0].tokens[${i}] shape invalid`);
    }
    if (token.contentTrust !== 'untrusted' || typeof token.truncated !== 'boolean') {
      return fail(errors, `${path}[0].tokens[${i}] trust/truncated invalid`);
    }
    if (typeof token.text !== 'string' || token.text.length === 0 || token.text.length > MAX_TOKEN_TEXT) {
      return fail(errors, `${path}[0].tokens[${i}].text must be 1..${MAX_TOKEN_TEXT}`);
    }
  }
  if (!(item.matchCount === 0 || (Number.isInteger(item.matchCount) && item.matchCount >= 2))) {
    return fail(errors, `${path}[0].matchCount must be 0 or >= 2`);
  }
  if (!isNonNegativeInt(item.totalTokenCount) || item.totalTokenCount < item.tokens.length) {
    return fail(errors, `${path}[0].totalTokenCount invalid`);
  }
  if (item.omittedTokenCount !== item.totalTokenCount - item.tokens.length) {
    return fail(errors, `${path}[0].omittedTokenCount must equal total - tokens.length`);
  }
  return true;
}

function validateTimeAttempted(attempted, path, errors) {
  if (!Array.isArray(attempted) || attempted.length !== 1) {
    return fail(errors, `${path} must contain exactly one TimeAttempt`);
  }
  const item = attempted[0];
  if (!isPlainObject(item) || !exactKeys(item, ['window', 'candidateCount'])) {
    return fail(errors, `${path}[0] shape invalid`);
  }
  if (!validateIsoRange(item.window, `${path}[0].window`, errors)) {
    return false;
  }
  if (!isNonNegativeInt(item.candidateCount)) {
    return fail(errors, `${path}[0].candidateCount invalid`);
  }
  return true;
}

function validateArgumentAttempted(attempted, path, errors) {
  if (!Array.isArray(attempted) || attempted.length > MAX_ARG_ATTEMPTS) {
    return fail(errors, `${path} must be an array of at most ${MAX_ARG_ATTEMPTS}`);
  }
  for (let i = 0; i < attempted.length; i += 1) {
    const item = attempted[i];
    if (!isPlainObject(item) || !exactKeys(item, ['field', 'message'])) {
      return fail(errors, `${path}[${i}] must be {field,message}`);
    }
    if (!isBoundedString(item.field, 64) || !isBoundedString(item.message, MAX_BOUNDED_STRING)) {
      return fail(errors, `${path}[${i}] strings invalid`);
    }
  }
  return true;
}

function validateUnavailableAttempted(code, attempted, path, errors) {
  switch (code) {
    case 'HUB_UNREACHABLE':
    case 'PROTOCOL_MISMATCH':
    case 'INVALID_RESPONSE':
      return validateHubAttempted(attempted, path, errors);
    case 'NO_EVIDENCE':
      return validateCaptureAttempted(attempted, path, errors);
    case 'TARGET_AMBIGUOUS':
      return validateMatchAttempted(attempted, path, errors);
    case 'TIME_UNRESOLVED':
      return validateTimeAttempted(attempted, path, errors);
    case 'INVALID_ARGUMENT':
      return validateArgumentAttempted(attempted, path, errors);
    default:
      return fail(errors, `unknown unavailable code ${code}`);
  }
}

function validateFacets(facets, path, errors) {
  if (!isPlainObject(facets)) {
    return fail(errors, `${path} must be an object`);
  }
  for (const [key, values] of Object.entries(facets)) {
    if (!isBoundedString(key, 64)) {
      return fail(errors, `${path} key invalid`);
    }
    if (!Array.isArray(values) || values.length > MAX_FACET_VALUES) {
      return fail(errors, `${path}.${key} must have at most ${MAX_FACET_VALUES} values`);
    }
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (!isPlainObject(value)
        || !exactKeys(value, ['contentTrust', 'text', 'count'])
        || value.contentTrust !== 'untrusted'
        || !isBoundedString(value.text, MAX_LABEL)
        || !isNonNegativeInt(value.count)) {
        return fail(errors, `${path}.${key}[${i}] invalid`);
      }
    }
  }
  return true;
}

function validateAction(result, errors) {
  const { code, action } = result;
  if (!ACTION_DEFS[code]) {
    return fail(errors, `unknown action code ${code}`);
  }
  if (!isPlainObject(action)) {
    return fail(errors, 'action must be an object');
  }
  const def = ACTION_DEFS[code];
  if (action.actor !== def.actor) {
    return fail(errors, `action.actor must be ${def.actor}`);
  }
  if (!def.reasons.includes(action.reasonCode)) {
    return fail(errors, `action.reasonCode invalid for ${code}`);
  }
  if (action.maxAttempts !== def.maxAttempts) {
    return fail(errors, `action.maxAttempts must be ${def.maxAttempts}`);
  }
  if (!Number.isInteger(action.attempt) || action.attempt < 1 || action.attempt > def.maxAttempts) {
    return fail(errors, `action.attempt must be an integer in 1..${def.maxAttempts}`);
  }

  const required = ACTION_REQUIRED_FIELDS[code];
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(action, field)) {
      return fail(errors, `action missing ${field}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(action, 'suggestedCommand')) {
    if (code !== 'LOCAL_HUB_NOT_RUNNING') {
      return fail(errors, 'only LOCAL_HUB_NOT_RUNNING may carry suggestedCommand');
    }
    if (action.suggestedCommand !== LOCAL_HUB_SUGGESTED_COMMAND) {
      return fail(errors, 'LOCAL_HUB_NOT_RUNNING.suggestedCommand must be the fixed literal');
    }
  }

  if (!validateContinuationArgvLazy(
    action.retryArgs,
    'action.retryArgs',
    errors,
    'action_required',
    code,
  )) {
    return false;
  }

  if (code === 'CAPTURE_LOGS') {
    const stepIndex = CAPTURE_STEPS.indexOf(action.captureStep);
    if (stepIndex < 0) {
      return fail(errors, 'action.captureStep invalid');
    }
    if (action.attempt !== stepIndex + 1) {
      return fail(errors, 'CAPTURE_LOGS attempt must equal captureStep ordinal');
    }
  }

  if (code === 'LOCAL_HUB_NOT_RUNNING' || code === 'CONNECT_HUB') {
    if (!validateHubAttempted(action.attempted, 'action.attempted', errors)) {
      return false;
    }
  }

  if (code === 'CONFIRM_TIME') {
    if (!Array.isArray(action.candidates) || action.candidates.length < 1 || action.candidates.length > 3) {
      return fail(errors, 'CONFIRM_TIME.candidates must have 1..3 entries');
    }
    for (let i = 0; i < action.candidates.length; i += 1) {
      if (!validateFinalCandidate(action.candidates[i], `action.candidates[${i}]`, errors, 'action_required', code)) {
        return false;
      }
    }
  }

  if (code === 'CONFIRM_TARGET') {
    if (!validateFacets(action.facets, 'action.facets', errors)) {
      return false;
    }
    if (!Array.isArray(action.examples) || action.examples.length > MAX_EXAMPLES) {
      return fail(errors, `action.examples must have at most ${MAX_EXAMPLES}`);
    }
    for (let i = 0; i < action.examples.length; i += 1) {
      if (!validateFinalCandidate(action.examples[i], `action.examples[${i}]`, errors, 'action_required', code)) {
        return false;
      }
    }
  }

  return true;
}

function validateSelection(result, errors) {
  if (result.code !== 'TARGET_SELECTION_REQUIRED') {
    return fail(errors, 'selection_required requires code TARGET_SELECTION_REQUIRED');
  }
  if (!isPlainObject(result.selection)
    || !exactKeys(result.selection, ['candidates', 'total'])) {
    return fail(errors, 'selection must be {candidates,total}');
  }
  const { candidates, total } = result.selection;
  if (!Array.isArray(candidates)
    || candidates.length < MIN_SELECTION
    || candidates.length > MAX_SELECTION) {
    return fail(errors, `selection.candidates length must be ${MIN_SELECTION}..${MAX_SELECTION}`);
  }
  if (!Number.isInteger(total) || total !== candidates.length) {
    return fail(errors, 'selection.total must equal candidates.length');
  }
  for (let i = 0; i < candidates.length; i += 1) {
    if (!validateFinalCandidate(
      candidates[i],
      `selection.candidates[${i}]`,
      errors,
      'selection_required',
      'TARGET_SELECTION_REQUIRED',
    )) {
      return false;
    }
  }
  return true;
}

function validateUnavailable(result, errors) {
  if (!UNAVAILABLE_DEFS[result.code]) {
    return fail(errors, `unknown unavailable code ${result.code}`);
  }
  if (Object.prototype.hasOwnProperty.call(result, 'action')
    || (result.error && Object.prototype.hasOwnProperty.call(result.error, 'retryArgs'))
    || Object.prototype.hasOwnProperty.call(result, 'retryArgs')) {
    return fail(errors, 'unavailable must not carry retryArgs');
  }
  if (!isPlainObject(result.error) || !exactKeys(result.error, ['message', 'attempted'])) {
    return fail(errors, 'unavailable requires error.message/error.attempted');
  }
  if (!isBoundedString(result.error.message, MAX_BOUNDED_STRING)) {
    return fail(errors, 'error.message invalid');
  }
  return validateUnavailableAttempted(result.code, result.error.attempted, 'error.attempted', errors);
}

/**
 * @param {unknown} value
 * @returns {{ok:true}|{ok:false,errors:string[]}}
 */
function validateDiagnoseResult(value) {
  const errors = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ['result must be an object'] };
  }
  if (value.schemaVersion !== 1) {
    fail(errors, 'schemaVersion must be 1');
  }
  if (!STATE_DEFS[value.state]) {
    fail(errors, `unknown state ${value.state}`);
    return { ok: false, errors };
  }

  hasForbiddenDumpKeys(value, 'result', errors, true);

  if (value.state === 'evidence_ready') {
    validateEvidence(value, errors);
  } else if (value.state === 'selection_required') {
    validateSelection(value, errors);
  } else if (value.state === 'action_required') {
    if (!ACTION_DEFS[value.code]) {
      fail(errors, `unknown action code ${value.code}`);
    } else {
      validateAction(value, errors);
    }
  } else if (value.state === 'unavailable') {
    validateUnavailable(value, errors);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function getDiagnoseExitCode(result) {
  const stateDef = STATE_DEFS[result?.state];
  if (Number.isInteger(stateDef?.exitCode)) {
    return stateDef.exitCode;
  }
  return UNAVAILABLE_DEFS[result?.code]?.exitCode ?? 5;
}

function finalizeDiagnoseResult(candidate) {
  const validation = validateDiagnoseResult(candidate);
  const result = validation.ok ? candidate : {
    schemaVersion: 1,
    state: 'unavailable',
    code: 'INVALID_RESPONSE',
    error: { message: validation.errors.join('; '), attempted: [] },
  };
  return { result, exitCode: getDiagnoseExitCode(result) };
}

function formatDiagnoseContractHelp() {
  const lines = [
    'diagnose result contract (schemaVersion 1)',
    '',
    'States:',
  ];
  for (const [state, def] of Object.entries(STATE_DEFS)) {
    if (Number.isInteger(def.exitCode)) {
      lines.push(`  ${state}: exit ${def.exitCode}${def.code !== undefined ? ` code=${JSON.stringify(def.code)}` : ''}`);
    } else {
      lines.push(`  ${state}: codes ${def.codes.join(', ')}`);
    }
  }
  lines.push('', 'action_required codes:');
  for (const [code, def] of Object.entries(ACTION_DEFS)) {
    lines.push(
      `  ${code}: actor=${def.actor} maxAttempts=${def.maxAttempts} reasons=${def.reasons.join('|')} exit=0`,
    );
  }
  lines.push('', 'unavailable codes:');
  for (const [code, def] of Object.entries(UNAVAILABLE_DEFS)) {
    lines.push(`  ${code}: exit ${def.exitCode}`);
  }
  lines.push('', `CAPTURE_LOGS steps: ${CAPTURE_STEPS.join(' -> ')}`);
  return lines.join('\n');
}

module.exports = {
  DIAGNOSE_DEFINITIONS,
  ACTION_DEFS,
  UNAVAILABLE_DEFS,
  STATE_DEFS,
  CAPTURE_STEPS,
  CAPTURE_OUTCOMES,
  LOCAL_HUB_SUGGESTED_COMMAND,
  validateDiagnoseResult,
  getDiagnoseExitCode,
  finalizeDiagnoseResult,
  formatDiagnoseContractHelp,
};
