import assert from 'node:assert/strict';
import test from 'node:test';
import {checkEvidence} from '../check-integration-evidence.mjs';

const ids = [
  'package', 'root-checks', 'demo-checks', 'docs-checks', 'consumer-current',
  'ios-current-debug', 'android-current-debug', 'consumer-minimum',
  'ios-minimum-debug', 'android-minimum-debug', 'release-default',
  'release-enabled', 'zero-config-pages', 'current-hub-session', 'showcase-flow',
  'history-restart', 'remount-refresh', 'ai-docs-integration', 'ai-docs-device',
  'ai-docs-idempotency',
];
function pending() {
  return {
    schemaVersion: 1,
    sourceCommit: 'a'.repeat(40),
    package: {version: '5.0.0', sha256: 'b'.repeat(64)},
    cases: ids.map(id => ({
      id, status: 'not_run',
      runtime: {reactNative: '0.85.1', react: '19.2.3', platform: 'ios', buildMode: 'Debug'},
      appId: null, sessionId: null, buildIdentity: null, marker: null,
      commands: [], actualResult: 'No device run.', evidencePaths: [],
      blocker: 'Native build has not completed.',
    })),
  };
}
function passed(row) {
  Object.assign(row, {
    status: 'passed', blocker: null,
    commands: [{command: 'rtk proxy verify', cwd: '$CONSUMER', exitCode: 0}],
    actualResult: 'Observed the acceptance assertion.', evidencePaths: ['run.log'],
  });
  return row;
}

test('an honest blocked matrix is valid but never complete', () => {
  const report = checkEvidence(pending());
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.counts, {passed: 0, failed: 0, not_run: 20});
  assert.equal(report.complete, false);
  assert.match(checkEvidence(pending(), {requireComplete: true}).errors.join('\n'), /incomplete/i);
});

test('missing cases, duplicate cases and invalid statuses cannot disappear from acceptance', () => {
  const data = pending();
  data.cases.pop();
  data.cases.push({...data.cases[0], status: 'green'});
  const errors = checkEvidence(data).errors.join('\n');
  assert.match(errors, /Missing ai-docs-idempotency/);
  assert.match(errors, /Duplicate package/);
  assert.match(errors, /status/);
});

test('passed checks require actual commands, evidence paths and a fixed artifact identity', () => {
  const data = pending();
  data.package.sha256 = 'latest';
  data.cases[0].status = 'passed';
  data.cases[0].blocker = null;
  const errors = checkEvidence(data).errors.join('\n');
  assert.match(errors, /sha256/);
  assert.match(errors, /successful command/);
  assert.match(errors, /evidencePaths/);
});

test('malformed command collections are reported instead of crashing the checker', () => {
  const data = pending();
  const row = passed(data.cases[0]);
  row.commands = 'npm test';
  assert.match(checkEvidence(data).errors.join('\n'), /commands/);
});

test('native and device success cannot be represented by static checks or an old Hub session', () => {
  const data = pending();
  const row = passed(data.cases.find(item => item.id === 'current-hub-session'));
  row.execution = 'renderer';
  const errors = checkEvidence(data).errors.join('\n');
  assert.match(errors, /device execution/);
  for (const name of ['appId', 'sessionId', 'buildIdentity', 'marker']) assert.match(errors, new RegExp(name));
  Object.assign(row, {execution: 'device', appId: 'org.example.app', sessionId: 'current-session', buildIdentity: 'build-1', marker: 'integration-this-run'});
  assert.deepEqual(checkEvidence(data).errors, []);
});

test('AI change evidence requires isolated public inputs and its retained patch', () => {
  const data = pending();
  const row = passed(data.cases.find(item => item.id === 'ai-docs-integration'));
  row.ai = {inputs: ['docs/internal-plan.md'], patch: null, publicDocsOnly: false};
  const errors = checkEvidence(data).errors.join('\n');
  assert.match(errors, /publicDocsOnly/);
  assert.match(errors, /patch/);
  assert.match(errors, /inputs/);
  row.ai = {publicDocsOnly: true, inputs: ['node_modules/react-native-debug-toolkit/docs/integration.md'], patch: 'integration.patch'};
  assert.deepEqual(checkEvidence(data).errors, []);
});

test('AI second pass requires exactly one host and an unchanged registration', () => {
  const data = pending();
  const row = passed(data.cases.find(item => item.id === 'ai-docs-idempotency'));
  row.ai = {passes: 1, hostCount: 2, registrationPreserved: false};
  assert.match(checkEvidence(data).errors.join('\n'), /second pass/);
  row.ai = {passes: 2, hostCount: 1, registrationPreserved: true};
  assert.deepEqual(checkEvidence(data).errors, []);
});
