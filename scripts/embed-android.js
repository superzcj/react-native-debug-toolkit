'use strict';

const fs = require('fs');
const path = require('path');

const APPLY_FROM_MARKER =
  '// react-native-debug-toolkit: debug bundle embed';
const APPLY_FROM_LINE =
  APPLY_FROM_MARKER +
  '\napply from: "../../node_modules/react-native-debug-toolkit/scripts/android-debug-bundle.gradle"';

function findBuildGradle(projectRoot) {
  const gradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
  const gradleKtsPath = path.join(
    projectRoot,
    'android',
    'app',
    'build.gradle.kts'
  );

  if (fs.existsSync(gradleKtsPath)) {
    return 'android/app/build.gradle.kts';
  }
  if (fs.existsSync(gradlePath)) {
    return 'android/app/build.gradle';
  }
  return null;
}

function ensureAssetsDir(projectRoot) {
  const assetsDir = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'assets'
  );
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
    console.log('  Created android/app/src/main/assets/');
  }
}

function injectGradleApply(projectRoot, buildGradleRelPath, entryFile, options) {
  const fullPath = path.join(projectRoot, buildGradleRelPath);
  let content = fs.readFileSync(fullPath, 'utf-8');

  // Idempotent check
  if (content.includes(APPLY_FROM_MARKER)) {
    console.log(
      `  ${buildGradleRelPath}: apply-from already present. Skipping.`
    );
    return { buildGradle: buildGradleRelPath, entryFile };
  }

  // Set entry file as ext property if non-default
  let entryFileExt = '';
  if (entryFile && entryFile !== 'index.js') {
    entryFileExt = `\nproject.ext.debugToolkitEntryFile = '${entryFile}'`;
  }

  content += '\n\n' + APPLY_FROM_LINE + entryFileExt + '\n';
  fs.writeFileSync(fullPath, content);

  ensureAssetsDir(projectRoot);
  console.log(`  ${buildGradleRelPath}: Injected apply-from for debug bundle.`);

  return { buildGradle: buildGradleRelPath, entryFile };
}

function undoGradleApply(projectRoot, config) {
  if (!config.android) {
    console.log('  No Android configuration found. Skipping.');
    return;
  }

  const fullPath = path.join(projectRoot, config.android.buildGradle);
  if (!fs.existsSync(fullPath)) {
    console.log(`  ${config.android.buildGradle} not found. Skipping.`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf-8');
  if (!content.includes(APPLY_FROM_MARKER)) {
    console.log('  apply-from not found. Skipping.');
    return;
  }

  // Remove the marker line, apply-from line, and optional entryFile ext
  const lines = content.split('\n');
  const filtered = lines.filter((line) => {
    if (line === APPLY_FROM_MARKER) return false;
    if (
      line.startsWith('apply from:') &&
      line.includes('react-native-debug-toolkit/scripts/android-debug-bundle.gradle')
    )
      return false;
    if (line.startsWith("project.ext.debugToolkitEntryFile = '")) return false;
    return true;
  });

  // Trim trailing empty lines introduced by our injection
  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }

  fs.writeFileSync(fullPath, filtered.join('\n') + '\n');
  console.log('  Removed apply-from from build.gradle.');
}

module.exports = {
  findBuildGradle,
  injectGradleApply,
  undoGradleApply,
};
