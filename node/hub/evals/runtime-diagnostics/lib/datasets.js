'use strict';

const EVAL_SCENARIO_MAP = Object.freeze({
  1: 'single_login_401',
  2: 'hub_stopped_then_capture',
  3: 'two_active_devices',
  4: 'stale_crash_and_active_restart',
  5: 'remote_with_unrelated_local',
  6: 'failure_then_250_noise',
  7: 'malicious_log_and_secret',
  8: 'occurred_1032_received_1040',
  9: 'twenty_one_targets',
  10: 'capture_exhausted',
  11: 'dateless_cross_midnight',
  12: 'omitted_preview_inspect_failure',
});

const EVAL_NAMES = Object.freeze({
  1: 'single_login_401',
  2: 'hub_stopped_then_capture',
  3: 'two_active_devices',
  4: 'stale_crash_and_active_restart',
  5: 'remote_with_unrelated_local',
  6: 'failure_then_250_noise',
  7: 'malicious_log_and_secret',
  8: 'occurred_1032_received_1040',
  9: 'twenty_one_targets',
  10: 'capture_exhausted',
  11: 'dateless_cross_midnight',
  12: 'omitted_preview_inspect_failure',
});

function loadBehaviorEvals() {
  return require('../evals.json');
}

function loadTriggerEvals() {
  return require('../trigger-evals.json');
}

function scenarioForEvalId(evalId) {
  return EVAL_SCENARIO_MAP[String(evalId)];
}

module.exports = {
  EVAL_SCENARIO_MAP,
  EVAL_NAMES,
  loadBehaviorEvals,
  loadTriggerEvals,
  scenarioForEvalId,
};
