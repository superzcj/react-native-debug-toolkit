'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BEGIN = '// react-native-debug-toolkit: begin debug bundle';
const END = '// react-native-debug-toolkit: end debug bundle';
const REL_SCRIPT = '../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle';
const EXPECTED_TASK = 'createDebugToolkitDebugJsAndAssets';
const GRADLE_TASKS_ARGS = [':app:tasks', '--all', '--no-daemon', '--console=plain'];

function findGradleFile(cwd) {
  const groovy = path.join(cwd, 'android/app/build.gradle');
  const kotlin = path.join(cwd, 'android/app/build.gradle.kts');

  if (fs.existsSync(kotlin)) {
    return { file: kotlin, kind: 'kotlin' };
  }

  if (fs.existsSync(groovy)) {
    return { file: groovy, kind: 'groovy' };
  }

  throw new Error('android/app/build.gradle(.kts) not found.');
}

function block(kind) {
  const applyLine = kind === 'kotlin'
    ? `apply(from = "${REL_SCRIPT}")`
    : `apply from: "${REL_SCRIPT}"`;

  return `${BEGIN}\n${applyLine}\n${END}`;
}

function removeBlock(content) {
  return content.replace(
    /\/\/ react-native-debug-toolkit: begin debug bundle\n[\s\S]*?\/\/ react-native-debug-toolkit: end debug bundle\n?/g,
    '',
  );
}

function setupAndroidBundle(options) {
  const gradle = findGradleFile(options.cwd);
  const content = fs.readFileSync(gradle.file, 'utf8');

  if (content.includes(BEGIN)) {
    return { ok: true, changed: false, file: gradle.file };
  }

  fs.writeFileSync(gradle.file, `${content.trimEnd()}\n\n${block(gradle.kind)}\n`);
  return { ok: true, changed: true, file: gradle.file };
}

function undoAndroidBundle(options) {
  const gradle = findGradleFile(options.cwd);
  const content = fs.readFileSync(gradle.file, 'utf8');
  const next = removeBlock(content).replace(/\n{3,}/g, '\n\n');

  if (next === content) {
    return { ok: true, changed: false, file: gradle.file };
  }

  fs.writeFileSync(gradle.file, next);
  return { ok: true, changed: true, file: gradle.file };
}

function checkAndroidBundle(options) {
  const gradle = findGradleFile(options.cwd);
  const content = fs.readFileSync(gradle.file, 'utf8');
  const hasMarker = content.includes(BEGIN) && content.includes('scripts/debug-bundle.gradle');

  if (!hasMarker) {
    return { ok: false, reason: 'marker_missing', file: gradle.file };
  }

  const androidDir = path.join(options.cwd, 'android');
  const gradlew = path.join(androidDir, 'gradlew');
  const command = fs.existsSync(gradlew) ? gradlew : 'gradle';
  const runGradle = options.runGradle || ((cmd, args, opts) => execFileSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const output = runGradle(command, GRADLE_TASKS_ARGS, { cwd: androidDir });

  if (!String(output).includes(EXPECTED_TASK)) {
    return { ok: false, reason: 'gradle_task_missing', file: gradle.file };
  }

  return { ok: true, file: gradle.file };
}

module.exports = {
  setupAndroidBundle,
  undoAndroidBundle,
  checkAndroidBundle,
  BEGIN,
  END,
  EXPECTED_TASK,
};
