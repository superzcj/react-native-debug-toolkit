'use strict';

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function parseCommon(args, cwd) {
  return {
    cwd,
    platform: readOption(args, '--platform') || 'all',
    undo: hasFlag(args, '--undo'),
    check: hasFlag(args, '--check'),
    iosTarget: readOption(args, '--ios-target'),
    yes: hasFlag(args, '--yes'),
  };
}

async function runBundleCli(args, deps = {}) {
  const cwd = deps.cwd || process.cwd();
  const io = deps.io || {
    writeOut: (value) => process.stdout.write(value),
    writeErr: (value) => process.stderr.write(value),
  };
  const command = args[0];

  if (command === 'setup-bundle') {
    const setupBundle = deps.setupBundle || require('./setup').setupBundle;
    await setupBundle(parseCommon(args.slice(1), cwd));
    return 0;
  }

  if (command === 'doctor-bundle') {
    const doctorBundle = deps.doctorBundle || require('./doctor').doctorBundle;
    await doctorBundle({
      cwd,
      platform: readOption(args.slice(1), '--platform') || 'all',
      app: readOption(args.slice(1), '--app'),
      apk: readOption(args.slice(1), '--apk'),
    });
    return 0;
  }

  if (command === 'embed') {
    io.writeErr('Unknown command: embed\nUse: debug-toolkit setup-bundle\n');
    return 1;
  }

  io.writeErr(`Unknown command: ${command || '(none)'}\n`);
  return 1;
}

module.exports = { runBundleCli };
