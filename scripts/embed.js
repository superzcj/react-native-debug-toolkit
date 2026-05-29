'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ios = require('./embed-ios');
const android = require('./embed-android');
const expo = require('./embed-expo');

const CONFIG_FILE = '.debug-toolkit-embed.json';

function readConfig(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function writeConfig(projectRoot, config) {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  const payload = { version: 1, ...config };
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2) + '\n');
}

function deleteConfig(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_FILE);
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

function detectEntryFile(projectRoot) {
  const candidates = [
    'index.js',
    'index.ts',
    'index.tsx',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(projectRoot, candidate))) {
      return candidate;
    }
  }

  // Expo virtual entry
  if (fs.existsSync(path.join(projectRoot, '.expo', '.virtual-metro-entry'))) {
    return '.expo/.virtual-metro-entry';
  }

  return 'index.js';
}

function prompt(question, options) {
  if (options && options.yes) {
    return Promise.resolve(true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question + ' [Y/n] ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

async function embed(projectRoot, argv) {
  const args = argv || [];
  const yes = args.includes('--yes');
  const platformIdx = args.indexOf('--platform');
  const platform =
    platformIdx >= 0 ? args[platformIdx + 1] : null; // 'ios' | 'android'

  console.log('debug-toolkit embed');
  console.log('---');

  // Check Expo
  const expoResult = expo.checkExpo(projectRoot, { yes });
  if (expoResult.expo) {
    console.log('Detected Expo project.');
    if (expoResult.skip) {
      console.log(`  Skipping: ${expoResult.reason}`);
      if (platform === null || platform === 'ios') {
        // nothing
      }
      return;
    }
    console.log('  Native directories found — proceeding.');
  }

  const existingConfig = readConfig(projectRoot);
  const config = {};

  // Entry file
  const entryFile =
    (expoResult.entryPoint) || detectEntryFile(projectRoot);
  console.log(`Entry file: ${entryFile}`);

  // iOS
  if (platform === null || platform === 'ios') {
    const xcodeprojEntries = ios.findXcodeproj(projectRoot);
    if (xcodeprojEntries && xcodeprojEntries.length > 0) {
      let chosen = xcodeprojEntries[0];
      if (xcodeprojEntries.length > 1) {
        if (yes) {
          console.log(
            `  Multiple Xcode projects found. Using: ${chosen}`
          );
        } else {
          console.log('  Multiple Xcode projects found:');
          xcodeprojEntries.forEach((e, i) =>
            console.log(`    ${i + 1}. ${e}`)
          );
          const idx = await prompt(
            `  Select project [1-${xcodeprojEntries.length}]`,
            { yes }
          );
          // Default to first
          chosen = xcodeprojEntries[0];
        }
      }

      const xcodeprojRelPath = path.join('ios', chosen);
      const shouldEmbed =
        yes ||
        (await prompt(
          `  Inject FORCE_BUNDLING into ${xcodeprojRelPath}?`,
          { yes }
        ));

      if (shouldEmbed !== false) {
        config.ios = ios.injectForceBundling(
          projectRoot,
          xcodeprojRelPath,
          entryFile,
          { yes }
        );
      }
    } else {
      console.log('  No Xcode project found. Skipping iOS.');
    }
  }

  // Android
  if (platform === null || platform === 'android') {
    const buildGradle = android.findBuildGradle(projectRoot);
    if (buildGradle) {
      const shouldEmbed =
        yes ||
        (await prompt(
          `  Inject debug bundle task into ${buildGradle}?`,
          { yes }
        ));

      if (shouldEmbed !== false) {
        config.android = android.injectGradleApply(
          projectRoot,
          buildGradle,
          entryFile,
          { yes }
        );
      }
    } else {
      console.log('  No Android build.gradle found. Skipping Android.');
    }
  }

  // Write config
  if (Object.keys(config).length > 0) {
    writeConfig(projectRoot, config);
    console.log(`\nConfiguration saved to ${CONFIG_FILE}`);
  }

  console.log('\nDone. Debug builds will now embed a JS bundle.');
  console.log('Use DevConnect to switch Metro hosts at runtime.');
}

async function undo(projectRoot, argv) {
  const args = argv || [];
  const yes = args.includes('--yes');

  console.log('debug-toolkit embed --undo');
  console.log('---');

  const config = readConfig(projectRoot);
  if (!config) {
    console.log(`No ${CONFIG_FILE} found. Nothing to undo.`);
    return;
  }

  const shouldUndo =
    yes || (await prompt('Remove all debug-toolkit embed injections?', { yes }));

  if (shouldUndo === false) {
    console.log('Cancelled.');
    return;
  }

  ios.undoForceBundling(projectRoot, config);
  android.undoGradleApply(projectRoot, config);

  deleteConfig(projectRoot);
  console.log(`\nRemoved ${CONFIG_FILE}.`);
  console.log('Done.');
}

function main(argv) {
  const projectRoot = process.cwd();
  const args = argv || [];

  if (args.includes('--undo')) {
    return undo(projectRoot, args);
  }

  return embed(projectRoot, args);
}

module.exports = { main, embed, undo };
