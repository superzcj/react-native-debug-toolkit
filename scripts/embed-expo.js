'use strict';

const fs = require('fs');
const path = require('path');

function isExpoProject(projectRoot) {
  // app.json with expo field
  const appJsonPath = path.join(projectRoot, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
      if (appJson.expo) return true;
    } catch (_) {}
  }

  // app.config.js or app.config.ts
  if (
    fs.existsSync(path.join(projectRoot, 'app.config.js')) ||
    fs.existsSync(path.join(projectRoot, 'app.config.ts'))
  ) {
    return true;
  }

  // expo in package.json dependencies
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.expo) return true;
    } catch (_) {}
  }

  return false;
}

function isExpoGo(projectRoot) {
  // Expo Go doesn't support embedded bundles
  // If no ios/ or android/ dirs, likely Expo Go
  const hasNativeDirs =
    fs.existsSync(path.join(projectRoot, 'ios')) ||
    fs.existsSync(path.join(projectRoot, 'android'));

  if (!hasNativeDirs) {
    return true;
  }
  return false;
}

function isPrebuilt(projectRoot) {
  // Dev client / bare workflow after prebuild
  return (
    fs.existsSync(path.join(projectRoot, 'ios')) &&
    fs.existsSync(path.join(projectRoot, 'android'))
  );
}

function getExpoEntryPoint(projectRoot) {
  const appJsonPath = path.join(projectRoot, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
      if (appJson.expo && appJson.expo.entryPoint) {
        return appJson.expo.entryPoint;
      }
    } catch (_) {}
  }

  // Expo default with .expo virtual entry
  const virtualEntry = path.join(
    projectRoot,
    '.expo',
    '.virtual-metro-entry'
  );
  if (fs.existsSync(virtualEntry)) {
    return '.expo/.virtual-metro-entry';
  }

  return null;
}

function checkExpo(projectRoot, options) {
  const expo = isExpoProject(projectRoot);
  if (!expo) {
    return { expo: false, skip: false };
  }

  if (isExpoGo(projectRoot)) {
    return {
      expo: true,
      skip: true,
      reason:
        'Expo Go does not support embedded bundles. Use expo-dev-client or run npx expo prebuild first.',
    };
  }

  if (!isPrebuilt(projectRoot)) {
    return {
      expo: true,
      skip: true,
      reason:
        'Native directories not found. Run npx expo prebuild first, then retry.',
    };
  }

  return { expo: true, skip: false, entryPoint: getExpoEntryPoint(projectRoot) };
}

module.exports = { isExpoProject, checkExpo, getExpoEntryPoint };
