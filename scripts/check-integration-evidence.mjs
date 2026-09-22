import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const requiredCases = [
  'package', 'root-checks', 'demo-checks', 'docs-checks', 'consumer-current',
  'ios-current-debug', 'android-current-debug', 'consumer-minimum',
  'ios-minimum-debug', 'android-minimum-debug', 'release-default',
  'release-enabled', 'zero-config-pages', 'current-hub-session', 'showcase-flow',
  'history-restart', 'remount-refresh', 'ai-docs-integration', 'ai-docs-device',
  'ai-docs-idempotency',
];
const nativeCases = new Set(['ios-current-debug', 'android-current-debug', 'ios-minimum-debug', 'android-minimum-debug']);
const deviceCases = new Set(['release-default', 'release-enabled', 'zero-config-pages', 'current-hub-session', 'showcase-flow', 'history-restart', 'remount-refresh', 'ai-docs-device']);
const currentSessionCases = new Set(['zero-config-pages', 'current-hub-session', 'showcase-flow', 'ai-docs-device']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// This checks evidence structure and claim boundaries, not whether an observation
// is true. Retain and review the actual command output before marking a case passed.
export function checkEvidence(data, {requireComplete = false} = {}) {
  const errors = [];
  const counts = {passed: 0, failed: 0, not_run: 0};
  const seen = new Set();
  if (data?.schemaVersion !== 1) errors.push('Expected schemaVersion 1');
  if (!/^[a-f0-9]{40}$/.test(data?.sourceCommit ?? '')) errors.push('Invalid sourceCommit');
  if (!nonempty(data?.package?.version)) errors.push('Missing package.version');
  if (!/^[a-f0-9]{64}$/.test(data?.package?.sha256 ?? '')) errors.push('Invalid package.sha256');
  if (!Array.isArray(data?.cases)) errors.push('Missing cases array');
  for (const row of Array.isArray(data?.cases) ? data.cases : []) {
    if (!row || typeof row !== 'object') { errors.push('Invalid case object'); continue; }
    const id = row.id;
    if (seen.has(id)) errors.push(`Duplicate ${id}`);
    seen.add(id);
    if (!requiredCases.includes(id)) errors.push(`Unknown ${id}`);
    if (!Object.hasOwn(counts, row.status)) errors.push(`${id}: invalid status`);
    else counts[row.status] += 1;
    for (const key of ['reactNative', 'react', 'platform', 'buildMode']) {
      if (!nonempty(row.runtime?.[key])) errors.push(`${id}: missing runtime.${key}`);
    }
    for (const key of ['appId', 'sessionId', 'buildIdentity', 'marker']) {
      if (row[key] !== null && !nonempty(row[key])) errors.push(`${id}: missing ${key} (use null when not observed)`);
    }
    if (!nonempty(row.actualResult)) errors.push(`${id}: missing actualResult`);
    if (!Array.isArray(row.evidencePaths) || row.evidencePaths.some(value => !nonempty(value))) errors.push(`${id}: invalid evidencePaths`);
    if (!Array.isArray(row.commands)) errors.push(`${id}: missing commands`);
    for (const command of Array.isArray(row.commands) ? row.commands : []) {
      if (!nonempty(command.command) || !nonempty(command.cwd) || !Number.isInteger(command.exitCode)) errors.push(`${id}: invalid command/cwd/exitCode`);
    }
    if (row.status === 'not_run' && !nonempty(row.blocker)) errors.push(`${id}: not_run requires a blocker`);
    if (row.status !== 'passed') continue;
    if (row.blocker !== null) errors.push(`${id}: passed case still has a blocker`);
    if (!Array.isArray(row.commands) || !row.commands.some(command => command.exitCode === 0)) errors.push(`${id}: passed requires a successful command`);
    if (!row.evidencePaths?.length) errors.push(`${id}: passed requires evidencePaths`);
    if (nativeCases.has(id) && row.execution !== 'native_build') errors.push(`${id}: requires native_build execution`);
    if (deviceCases.has(id) && row.execution !== 'device') errors.push(`${id}: requires device execution`);
    if (nativeCases.has(id) || deviceCases.has(id)) {
      for (const key of ['appId', 'buildIdentity']) if (!nonempty(row[key])) errors.push(`${id}: passed requires ${key}`);
    }
    if (currentSessionCases.has(id)) {
      for (const key of ['sessionId', 'marker']) if (!nonempty(row[key])) errors.push(`${id}: current event requires ${key}`);
    }
    if (id === 'ai-docs-integration') {
      if (row.ai?.publicDocsOnly !== true) errors.push(`${id}: requires publicDocsOnly`);
      if (!nonempty(row.ai?.patch)) errors.push(`${id}: requires retained patch`);
      if (!Array.isArray(row.ai?.inputs) || !row.ai.inputs.length || row.ai.inputs.some(input => !/^node_modules\/react-native-debug-toolkit\/(README[^/]*\.md|docs\/(integration|configuration|setup|usage)[^/]*\.md|docs\/examples\/integration\/[^/]+)$/.test(input))) errors.push(`${id}: inputs must be packaged public docs`);
    }
    if (id === 'ai-docs-idempotency' && !(row.ai?.passes >= 2 && row.ai?.hostCount === 1 && row.ai?.registrationPreserved === true)) errors.push(`${id}: second pass must preserve registration and exactly one host`);
  }
  for (const id of requiredCases) if (!seen.has(id)) errors.push(`Missing ${id}`);
  const complete = errors.length === 0 && counts.passed === requiredCases.length;
  if (requireComplete && !complete) errors.push('Acceptance incomplete: every required case must pass');
  return {errors, counts, complete};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [file, option] = process.argv.slice(2);
    if (!file || (option && option !== '--require-complete') || process.argv.length > 4) throw new Error('Usage: node scripts/check-integration-evidence.mjs <evidence.json> [--require-complete]');
    const result = checkEvidence(JSON.parse(await readFile(file, 'utf8')), {requireComplete: option === '--require-complete'});
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
