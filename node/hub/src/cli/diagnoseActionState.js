'use strict';

const {
  ACTION_DEFS,
  CAPTURE_STEPS,
  LOCAL_HUB_SUGGESTED_COMMAND,
  finalizeDiagnoseResult,
} = require('./diagnoseResultSchema');
const {
  deriveResumeState,
  buildResumeArgs,
  decodeResumeToken,
} = require('./diagnoseResumeToken');
const { parseIsoInstant, toIsoInstant } = require('../protocol/time');

const CAPTURE_SEQUENCE = Object.freeze(['open_app', 'upload_once', 'start_live', 'reproduce_issue']);
const TERMINAL_BY_ACTION = Object.freeze({
  LOCAL_HUB_NOT_RUNNING: 'HUB_UNREACHABLE',
  CAPTURE_LOGS: 'NO_EVIDENCE',
  CONFIRM_TIME: 'TIME_UNRESOLVED',
  CONFIRM_TARGET: 'TARGET_AMBIGUOUS',
  CONNECT_HUB: 'HUB_UNREACHABLE',
  ALLOW_STALE: 'INVALID_RESPONSE',
});

const SKIP_OPEN_APP = Object.freeze(['no_session', 'empty_session', 'paused_empty']);

function applyTransition(state, transition) {
  const next = deriveResumeState(state, transition);
  if (!next.ok) {
    throw new Error(next.message);
  }
  return next.state;
}

function completedSteps(state) {
  return new Set((state.capture.completed || []).map((item) => item.step));
}

function isoWindowFromState(state, decision) {
  if (decision?.window?.sinceMs != null && decision?.window?.untilMs != null) {
    return {
      since: toIsoInstant(decision.window.sinceMs),
      until: toIsoInstant(decision.window.untilMs),
    };
  }
  if (state.time.kind === 'range') {
    return { since: state.time.since, until: state.time.until };
  }
  if (state.time.kind === 'at') {
    const at = parseIsoInstant(state.time.at);
    return {
      since: toIsoInstant(at - 300000),
      until: toIsoInstant(at + 300000),
    };
  }
  return {
    since: '2026-08-17T02:30:00.000Z',
    until: '2026-08-17T02:40:00.000Z',
  };
}

function unavailable(code, message, attempted) {
  return {
    schemaVersion: 1,
    state: 'unavailable',
    code,
    error: { message, attempted: attempted || [] },
  };
}

function wrap(result, nextState) {
  const finalized = finalizeDiagnoseResult(result);
  return { result: finalized.result, nextState, exitCode: finalized.exitCode };
}

function materializeCapture(reasonCode, resumeState) {
  let state = resumeState;
  const done = completedSteps(state);

  if (SKIP_OPEN_APP.includes(reasonCode) && !done.has('open_app')) {
    state = applyTransition(state, {
      incrementAction: 'CAPTURE_LOGS',
      completeCaptureStep: { step: 'open_app', outcome: 'already_observed' },
    });
  }

  const nextStep = CAPTURE_SEQUENCE.find((step) => !completedSteps(state).has(step));
  if (!nextStep) {
    return wrap(
      unavailable(
        'NO_EVIDENCE',
        'No diagnostic evidence after capture steps',
        CAPTURE_SEQUENCE.map((step) => {
          const recorded = state.capture.completed.find((item) => item.step === step);
          return { step, outcome: recorded ? recorded.outcome : 'requested' };
        }),
      ),
      state,
    );
  }

  state = applyTransition(state, {
    incrementAction: 'CAPTURE_LOGS',
    completeCaptureStep: { step: nextStep, outcome: 'requested' },
  });
  const attempt = CAPTURE_SEQUENCE.indexOf(nextStep) + 1;
  const def = ACTION_DEFS.CAPTURE_LOGS;
  return wrap({
    schemaVersion: 1,
    state: 'action_required',
    code: 'CAPTURE_LOGS',
    action: {
      actor: def.actor,
      reasonCode,
      captureStep: nextStep,
      attempt,
      maxAttempts: def.maxAttempts,
      retryArgs: buildResumeArgs(state),
    },
  }, state);
}

function materializeOneAttempt(code, reasonCode, resumeState, extraAction, omitTime) {
  const def = ACTION_DEFS[code];
  if (resumeState.attempts[code] >= def.maxAttempts) {
    const terminal = TERMINAL_BY_ACTION[code];
    if (code === 'CONFIRM_TIME') {
      const window = isoWindowFromState(resumeState, extraAction);
      return wrap(unavailable(terminal, 'Time remained unresolved', [{
        window,
        candidateCount: Array.isArray(extraAction?.candidates) ? extraAction.candidates.length : 0,
      }]), resumeState);
    }
    if (code === 'CONFIRM_TARGET') {
      return wrap(unavailable(terminal, 'Target remained ambiguous', extraAction?.attempted || [{
        tokens: [],
        matchCount: 0,
        totalTokenCount: 0,
        omittedTokenCount: 0,
      }]), resumeState);
    }
    if (code === 'ALLOW_STALE') {
      return wrap(unavailable(terminal, 'Stale permission was not applied', []), resumeState);
    }
    return wrap(unavailable(terminal, 'Hub remained unreachable', extraAction?.attempted || []), resumeState);
  }

  const transitions = { incrementAction: code };
  if (code === 'ALLOW_STALE') {
    transitions.allowStale = true;
  }
  const state = applyTransition(resumeState, transitions);
  const allowed = {};
  if (extraAction?.attempted) {
    allowed.attempted = extraAction.attempted;
  }
  if (extraAction?.candidates) {
    allowed.candidates = extraAction.candidates;
  }
  if (extraAction?.facets) {
    allowed.facets = extraAction.facets;
  }
  if (extraAction?.examples) {
    allowed.examples = extraAction.examples;
  }
  const action = {
    actor: def.actor,
    reasonCode,
    attempt: state.attempts[code],
    maxAttempts: def.maxAttempts,
    retryArgs: buildResumeArgs(state, { omitTime: Boolean(omitTime) }),
    ...allowed,
  };
  if (code === 'LOCAL_HUB_NOT_RUNNING') {
    action.suggestedCommand = LOCAL_HUB_SUGGESTED_COMMAND;
  }
  return wrap({
    schemaVersion: 1,
    state: 'action_required',
    code,
    action,
  }, state);
}

function materializeDiagnoseDecision(decision, resumeState) {
  if (decision.kind === 'selected') {
    return wrap({
      schemaVersion: 1,
      state: 'evidence_ready',
      code: null,
      target: decision.target,
      session: decision.session,
      window: decision.evidenceWindow,
      context: decision.context,
      completeness: decision.completeness,
    }, decision.nextState || resumeState);
  }

  if (decision.kind === 'selection') {
    return wrap({
      schemaVersion: 1,
      state: 'selection_required',
      code: 'TARGET_SELECTION_REQUIRED',
      selection: {
        candidates: decision.candidates,
        total: decision.total,
      },
    }, resumeState);
  }

  if (decision.kind === 'invalid') {
    return wrap(unavailable(
      'INVALID_ARGUMENT',
      decision.message || 'Invalid diagnose arguments',
      decision.attempted || [{ field: 'argv', message: decision.message || 'invalid' }],
    ), resumeState);
  }

  if (decision.kind === 'terminal') {
    return wrap(unavailable(
      decision.code,
      decision.message || decision.code,
      decision.attempted || [],
    ), resumeState);
  }

  if (decision.kind === 'fact') {
    const reason = decision.reasonCode;
    if (['no_app', 'no_session', 'empty_session', 'paused_empty'].includes(reason)) {
      return materializeCapture(reason, resumeState);
    }
    if (reason === 'only_stale') {
      return materializeOneAttempt('ALLOW_STALE', reason, resumeState, {});
    }
    if (reason === 'no_time_overlap') {
      return materializeOneAttempt('CONFIRM_TIME', reason, resumeState, {
        candidates: (decision.candidates || []).slice(0, 3),
        window: decision.window,
      }, true);
    }
    if (reason === 'candidate_budget_exceeded') {
      return materializeOneAttempt('CONFIRM_TARGET', reason, resumeState, {
        facets: decision.facets || {},
        examples: (decision.examples || []).slice(0, 5),
      }, true);
    }
  }

  return wrap(unavailable('INVALID_RESPONSE', `Unsupported decision ${decision.kind}`, []), resumeState);
}

function materializeHubFailure(failure, resumeState) {
  const attempted = failure.attempted || [];
  if (failure.code === 'PROTOCOL_MISMATCH') {
    return wrap(unavailable('PROTOCOL_MISMATCH', 'Hub protocol mismatch', attempted), resumeState);
  }
  if (failure.reasonCode === 'no_usable_implicit_hub' || failure.code === 'LOCAL_HUB_NOT_RUNNING') {
    return materializeOneAttempt(
      'LOCAL_HUB_NOT_RUNNING',
      'no_usable_implicit_hub',
      resumeState,
      { attempted },
    );
  }
  const reason = failure.reasonCode || 'explicit_hub_unreachable';
  return materializeOneAttempt('CONNECT_HUB', reason, resumeState, { attempted });
}

module.exports = {
  CAPTURE_SEQUENCE,
  TERMINAL_BY_ACTION,
  materializeDiagnoseDecision,
  materializeHubFailure,
};
