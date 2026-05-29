'use strict';

const fs = require('fs');
const path = require('path');
const pbxproj = require('pbxproj');

const BUNDLE_PHASE_NAME = 'Bundle React Native code and images';
const FORCE_BUNDLING_LINE = 'export FORCE_BUNDLING=1';
const CONFIG_FILE = '.debug-toolkit-embed.json';

function findXcodeproj(projectRoot) {
  const iosDir = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDir)) {
    return null;
  }
  const entries = fs.readdirSync(iosDir).filter(
    (e) => e.endsWith('.xcodeproj') && e !== 'Pods.xcodeproj'
  );
  if (entries.length === 0) {
    return null;
  }
  return entries;
}

function findPbxproj(xcodeprojPath) {
  const pbxPath = path.join(xcodeprojPath, 'project.pbxproj');
  if (!fs.existsSync(pbxPath)) {
    throw new Error(`project.pbxproj not found at ${pbxPath}`);
  }
  return pbxPath;
}

function getBundleScriptPhase(pbxFile) {
  const proj = new pbxproj(pbxFile).parseSync();
  const sections = proj.hash.project.objects.PBXShellScriptBuildPhase;
  if (!sections) {
    return null;
  }
  for (const [key, section] of Object.entries(sections)) {
    if (
      section.name === BUNDLE_PHASE_NAME ||
      section.name === `"${BUNDLE_PHASE_NAME}"`
    ) {
      return { id: key, section, proj, pbxFile };
    }
  }
  return null;
}

function injectForceBundling(projectRoot, xcodeprojRelPath, entryFile, options) {
  const xcodeprojPath = path.join(projectRoot, xcodeprojRelPath);
  const pbxFile = findPbxproj(xcodeprojPath);
  const result = getBundleScriptPhase(pbxFile);
  if (!result) {
    throw new Error(
      `"${BUNDLE_PHASE_NAME}" script phase not found in ${xcodeprojRelPath}`
    );
  }

  const scriptBody = result.section.shellScript;
  // Already injected — idempotent
  if (scriptBody && scriptBody.includes(FORCE_BUNDLING_LINE)) {
    console.log(`  ${xcodeprojRelPath}: FORCE_BUNDLING already set. Skipping.`);
    return { xcodeproj: xcodeprojRelPath, scriptPhaseId: result.id, entryFile };
  }

  // Decode shellScript (it's usually a quoted string)
  let decoded = scriptBody;
  try {
    decoded = JSON.parse(scriptBody);
  } catch (_) {
    // Not JSON-encoded, use as-is
  }

  const newScript = FORCE_BUNDLING_LINE + '\n' + decoded;
  result.section.shellScript = JSON.stringify(newScript);

  fs.writeFileSync(pbxFile, result.proj.writeSync());
  console.log(`  ${xcodeprojRelPath}: Injected FORCE_BUNDLING=1`);

  return { xcodeproj: xcodeprojRelPath, scriptPhaseId: result.id, entryFile };
}

function undoForceBundling(projectRoot, config) {
  if (!config.ios) {
    console.log('  No iOS configuration found. Skipping.');
    return;
  }

  const xcodeprojPath = path.join(projectRoot, config.ios.xcodeproj);
  const pbxFile = findPbxproj(xcodeprojPath);
  const result = getBundleScriptPhase(pbxFile);
  if (!result) {
    console.log('  Bundle script phase not found. Skipping.');
    return;
  }

  const scriptBody = result.section.shellScript;
  let decoded = scriptBody;
  try {
    decoded = JSON.parse(scriptBody);
  } catch (_) {}

  if (!decoded.includes(FORCE_BUNDLING_LINE)) {
    console.log('  FORCE_BUNDLING not found in script. Skipping.');
    return;
  }

  const newScript = decoded
    .split('\n')
    .filter((line) => line !== FORCE_BUNDLING_LINE)
    .join('\n');
  result.section.shellScript = JSON.stringify(newScript);

  fs.writeFileSync(pbxFile, result.proj.writeSync());
  console.log('  Removed FORCE_BUNDLING=1 from script phase.');
}

module.exports = { findXcodeproj, injectForceBundling, undoForceBundling };
