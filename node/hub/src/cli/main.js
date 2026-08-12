'use strict';

const { DEFAULT_PORT } = require('../protocol/constants');
const { normalizeEndpoint } = require('../protocol/validation');

function readOption(args, name, fallback) {
  const idx = args.indexOf(name);
  if (idx < 0 || idx >= args.length - 1) return fallback;
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function parseArgs(args) {
  const command = args[0] || '';
  const subcommand = args[1] || '';
  const portValue = readOption(args, '--port', undefined);
  return {
    command,
    subcommand,
    endpoint: readOption(args, '--endpoint', process.env.DEBUG_TOOLKIT_HUB_ENDPOINT),
    appId: readOption(args, '--app-id', process.env.DEBUG_TOOLKIT_APP_ID),
    session: readOption(args, '--session', undefined),
    cursor: readOption(args, '--cursor', undefined),
    through: readOption(args, '--through', undefined),
    since: readOption(args, '--since', undefined),
    until: readOption(args, '--until', undefined),
    allowStale: hasFlag(args, '--allow-stale'),
    follow: hasFlag(args, '--follow'),
    bind: readOption(args, '--bind', '127.0.0.1'),
    port: portValue === undefined ? undefined : parseInt(portValue, 10),
    dataDir: readOption(args, '--data-dir', undefined),
    advertiseUrl: readOption(args, '--advertise-url', undefined),
    system: hasFlag(args, '--system'),
    replace: hasFlag(args, '--replace'),
    dryRun: hasFlag(args, '--dry-run'),
    check: hasFlag(args, '--check'),
    update: hasFlag(args, '--update'),
    help: hasFlag(args, '--help') || hasFlag(args, '-h'),
    json: hasFlag(args, '--json'),
    entryId: null, // set below
  };
}

function printHelp() {
  process.stderr.write(
    'Usage: debug-toolkit <command> [options]\n\n'
    + 'Commands:\n'
    + '  status                    Check Hub and list sessions\n'
    + '  context                   Read evidence snapshot\n'
    + '  inspect <entryId>         Read full event record\n'
    + '  tail                      Subscribe to live events (NDJSON)\n'
    + '  hub start                 Start Hub in local foreground mode\n'
    + '  hub install --system      Install Hub as a macOS LaunchDaemon\n'
    + '  init-skill                Generate repo-level AI Skill\n'
    + '\n'
    + 'Common options:\n'
    + '  --endpoint <url>          Hub URL (or DEBUG_TOOLKIT_HUB_ENDPOINT)\n'
    + '  --app-id <id>             App identifier (or DEBUG_TOOLKIT_APP_ID)\n'
    + '  --session <id>            Session ID\n'
    + '  --allow-stale             Allow reading stale sessions\n'
    + '  --json                    JSON output\n'
    + '  -h, --help                Show help\n'
    + '\n'
    + 'tail options:\n'
    + '  --cursor <cursor>         Resume from cursor\n'
    + '  --follow                  Infinite tail (human use)\n'
    + '\n'
    + 'hub start options:\n'
    + '  --bind <ip>               Bind address (default: 127.0.0.1)\n'
    + '  --port <port>             Port (default: 3799)\n'
    + '  --data-dir <path>         Data directory\n'
    + '  --advertise-url <url>     Public URL\n'
  );
}

async function main(argv) {
  const args = argv || process.argv.slice(2);

  if (args.length === 0 || hasFlag(args, '--help') || hasFlag(args, '-h')) {
    printHelp();
    return { exitCode: 0 };
  }

  const parsed = parseArgs(args);

  // Handle hub subcommands
  if (parsed.command === 'hub') {
    if (parsed.subcommand === 'start') {
      const { hubStartCommand } = require('./commands/hubStart');
      return hubStartCommand(parsed);
    }
    if (parsed.subcommand === 'install') {
      const { hubInstallCommand } = require('./commands/hubInstall');
      return hubInstallCommand(parsed);
    }
    process.stderr.write('Unknown hub command. Use: hub start | hub install --system\n');
    return { exitCode: 1 };
  }

  // Handle init-skill
  if (parsed.command === 'init-skill') {
    const { initSkillCommand } = require('./commands/initSkill');
    return initSkillCommand(parsed);
  }

  // Commands requiring endpoint and appId
  if (!parsed.endpoint) {
    process.stderr.write('--endpoint is required (or set DEBUG_TOOLKIT_HUB_ENDPOINT)\n');
    return { exitCode: 2 };
  }
  const endpoint = normalizeEndpoint(parsed.endpoint);
  if (!endpoint) {
    process.stderr.write('Invalid endpoint\n');
    return { exitCode: 2 };
  }
  parsed.endpoint = endpoint;

  if (!parsed.appId) {
    process.stderr.write('--app-id is required (or set DEBUG_TOOLKIT_APP_ID)\n');
    return { exitCode: 2 };
  }

  if (parsed.command === 'status') {
    const { statusCommand } = require('./commands/status');
    const result = await statusCommand(parsed);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return { exitCode: result.exitCode };
  }

  if (parsed.command === 'context') {
    const { contextCommand } = require('./commands/context');
    const result = await contextCommand(parsed);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return { exitCode: result.exitCode };
  }

  if (parsed.command === 'inspect') {
    parsed.entryId = args[1];
    if (!parsed.entryId) {
      process.stderr.write('Usage: debug-toolkit inspect <entryId>\n');
      return { exitCode: 2 };
    }
    const { inspectCommand } = require('./commands/inspect');
    const result = await inspectCommand(parsed);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return { exitCode: result.exitCode };
  }

  if (parsed.command === 'tail') {
    const { tailCommand } = require('./commands/tail');
    return tailCommand(parsed);
  }

  process.stderr.write('Unknown command: ' + parsed.command + '\n');
  printHelp();
  return { exitCode: 1 };
}

module.exports = { main, parseArgs, printHelp };
