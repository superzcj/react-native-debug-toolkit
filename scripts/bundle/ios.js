'use strict';

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const PHASE_NAME = 'Bundle React Native code and images';
const BEGIN = '# react-native-debug-toolkit: begin debug bundle';
const END = '# react-native-debug-toolkit: end debug bundle';
const BLOCK = `${BEGIN}\nexport FORCE_BUNDLING=1\nunset SKIP_BUNDLING\n${END}`;

function stripQuotes(value) {
  return String(value || '').replace(/^"|"$/g, '');
}

function findProjects(cwd) {
  const iosDir = path.join(cwd, 'ios');
  if (!fs.existsSync(iosDir)) {
    return [];
  }

  return fs.readdirSync(iosDir)
    .filter((entry) => entry.endsWith('.xcodeproj') && entry !== 'Pods.xcodeproj')
    .map((entry) => path.join(iosDir, entry, 'project.pbxproj'))
    .filter((file) => fs.existsSync(file));
}

function hasIosBundleProject(cwd) {
  return findProjects(cwd).length > 0;
}

function decodeScript(value) {
  if (!value) {
    return '';
  }

  try {
    return JSON.parse(value);
  } catch {
    return stripQuotes(value);
  }
}

function encodeScript(value) {
  return JSON.stringify(value);
}

function phaseName(phase) {
  return stripQuotes(phase.name || phase.comment);
}

function isAppTarget(target) {
  return stripQuotes(target.productType) === 'com.apple.product-type.application';
}

function targetName(target) {
  return stripQuotes(target.name || target.productName || target.comment);
}

function targetBuildPhaseIds(target) {
  return (target.buildPhases || []).map((phaseRef) => {
    if (typeof phaseRef === 'string') {
      return phaseRef;
    }
    return phaseRef.value;
  });
}

function sectionEntries(objects, sectionName, isaName) {
  const section = objects[sectionName];
  if (section) {
    return Object.entries(section)
      .filter(([key]) => !key.endsWith('_comment'));
  }

  return Object.entries(objects)
    .filter(([key, value]) => !key.endsWith('_comment') && value && value.isa === isaName)
    .map(([key, value]) => [key, { ...value, comment: objects[`${key}_comment`] }]);
}

function loadTarget(cwd, iosTarget) {
  const projects = findProjects(cwd);
  if (projects.length !== 1) {
    throw new Error(`Expected one Xcode project, found ${projects.length}. Pass --ios-target after selecting the app project.`);
  }

  const pbxFile = projects[0];
  const proj = xcode.project(pbxFile).parseSync();
  const objects = proj.hash.project.objects;
  const nativeTargets = sectionEntries(objects, 'PBXNativeTarget', 'PBXNativeTarget');
  const shellPhases = new Map(sectionEntries(objects, 'PBXShellScriptBuildPhase', 'PBXShellScriptBuildPhase'));

  const appTargets = nativeTargets
    .filter(([, target]) => isAppTarget(target));

  const matches = iosTarget
    ? appTargets.filter(([, target]) => targetName(target) === iosTarget)
    : appTargets;

  if (matches.length !== 1) {
    throw new Error(`Expected one iOS app target, found ${matches.length}. Pass --ios-target <name>.`);
  }

  const [, target] = matches[0];
  for (const phaseId of targetBuildPhaseIds(target)) {
    const phase = shellPhases.get(phaseId);
    if (!phase || phaseName(phase) !== PHASE_NAME) {
      continue;
    }

    const script = decodeScript(phase.shellScript);
    if (!script.includes('react-native-xcode.sh') && !script.includes('with-environment.sh')) {
      throw new Error(`${PHASE_NAME} does not call React Native bundling script.`);
    }

    return { pbxFile, proj, phase };
  }

  throw new Error(`${PHASE_NAME} phase not found on iOS app target.`);
}

function insertBlock(script) {
  if (script.includes(BEGIN)) {
    const withoutExistingBlock = removeBlock(script);
    if (withoutExistingBlock !== script) {
      return insertBlock(withoutExistingBlock);
    }
    return script;
  }

  const skipBundlingMatch = script.match(/^[^\S\r\n]*export SKIP_BUNDLING=1[^\S\r\n]*(?:\r?\n|$)/m);
  if (skipBundlingMatch?.index !== undefined) {
    const insertAt = skipBundlingMatch.index + skipBundlingMatch[0].length;
    return `${script.slice(0, insertAt)}${BLOCK}\n${script.slice(insertAt)}`;
  }

  return `${BLOCK}\n${script}`;
}

function removeBlock(script) {
  return script.replace(
    /# react-native-debug-toolkit: begin debug bundle\r?\nexport FORCE_BUNDLING=1\r?\n(?:unset SKIP_BUNDLING\r?\n)?# react-native-debug-toolkit: end debug bundle\r?\n?/g,
    '',
  );
}

function writeProject(ctx, script) {
  ctx.phase.shellScript = encodeScript(script);
  fs.writeFileSync(ctx.pbxFile, ctx.proj.writeSync());
}

function setupIosBundle(options) {
  const ctx = loadTarget(options.cwd, options.iosTarget);
  const script = decodeScript(ctx.phase.shellScript);
  const next = insertBlock(script);

  if (next === script) {
    return { ok: true, changed: false };
  }

  writeProject(ctx, next);
  return { ok: true, changed: true };
}

function undoIosBundle(options) {
  const ctx = loadTarget(options.cwd, options.iosTarget);
  const script = decodeScript(ctx.phase.shellScript);
  const next = removeBlock(script);

  if (next === script) {
    return { ok: true, changed: false };
  }

  writeProject(ctx, next);
  return { ok: true, changed: true };
}

function checkIosBundle(options) {
  const ctx = loadTarget(options.cwd, options.iosTarget);
  const script = decodeScript(ctx.phase.shellScript);

  return {
    ok: script.includes(BLOCK),
    changed: false,
    file: ctx.pbxFile,
  };
}

module.exports = {
  setupIosBundle,
  undoIosBundle,
  checkIosBundle,
  hasIosBundleProject,
  BEGIN,
  END,
};
