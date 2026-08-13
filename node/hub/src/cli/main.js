'use strict';

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
    hub: readOption(args, '--hub', undefined),
    appId: readOption(args, '--app-id', process.env.DEBUG_TOOLKIT_APP_ID),
    session: readOption(args, '--session', undefined),
    through: readOption(args, '--through', undefined),
    since: readOption(args, '--since', undefined),
    until: readOption(args, '--until', undefined),
    sinceSequence: readOption(args, '--since-sequence', undefined),
    allowStale: hasFlag(args, '--allow-stale'),
    follow: hasFlag(args, '--follow'),
    url: readOption(args, '--url', undefined),
    bind: readOption(args, '--bind', undefined),
    port: portValue === undefined ? undefined : parseInt(portValue, 10),
    dataDir: readOption(args, '--data-dir', undefined),
    advertiseUrl: readOption(args, '--advertise-url', undefined),
    help: hasFlag(args, '--help') || hasFlag(args, '-h'),
    json: hasFlag(args, '--json'),
    entryId: null, // set below
  };
}

function printHelp() {
  process.stderr.write(
    'Usage: debug-toolkit <command> [options]\n\n'
    + 'Commands:\n'
    + '  hub dev                   Run a local Hub for App development\n'
    + '  init                      Enable AI runtime diagnostics in this repository\n'
    + '  status                    Check Hub and list sessions (AI/advanced)\n'
    + '  context                   Read evidence snapshot (AI/advanced)\n'
    + '  inspect <entryId>         Read full event record (AI/advanced)\n'
    + '  tail                      Subscribe to live events (AI/advanced)\n'
    + '\n'
    + 'Common options:\n'
    + '  --endpoint <url>          Project default Hub URL (probed after 127.0.0.1:3800)\n'
    + '  --hub <url>               Use this Hub URL only (user-provided override)\n'
    + '  --app-id <id>             App identifier (or DEBUG_TOOLKIT_APP_ID)\n'
    + '  --session <id>            Session ID\n'
    + '  --allow-stale             Allow reading stale sessions\n'
    + '  --json                    JSON output\n'
    + '  -h, --help                Show help\n'
    + '\n'
    + 'tail options:\n'
    + '  --since-sequence <n>      Resume after this sequence\n'
    + '  --follow                  Infinite tail (human use)\n'
  );
}

function printHubHelp() {
  process.stderr.write(
    'Usage: debug-toolkit hub <command>\n\n'
    + 'Commands:\n'
    + '  dev                       Run a local foreground Hub on port 3800\n'
    + '\n'
    + 'Examples:\n'
    + '  debug-toolkit hub dev\n'
  );
}

async function main(argv) {
  const args = argv || process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    return { exitCode: 0 };
  }

  const parsed = parseArgs(args);
  if (parsed.help) {
    if (parsed.command === 'hub') printHubHelp();
    else printHelp();
    return { exitCode: 0 };
  }

  // Handle hub subcommands
  if (parsed.command === 'hub') {
    if (parsed.subcommand === 'dev') {
      const { hubStartCommand, resolveDevOptions } = require('./commands/hubStart');
      return hubStartCommand(resolveDevOptions(parsed));
    }
    if (parsed.subcommand === 'start') {
      const { hubStartCommand } = require('./commands/hubStart');
      return hubStartCommand(parsed);
    }
    process.stderr.write('Unknown hub command. Use: hub dev\n');
    return { exitCode: 1 };
  }

  // `init-skill` remains a compatibility alias.
  if (parsed.command === 'init' || parsed.command === 'init-skill') {
    const { initSkillCommand } = require('./commands/initSkill');
    return initSkillCommand(parsed);
  }

  const hubReadCommands = new Set(['status', 'context', 'inspect', 'tail']);
  if (!hubReadCommands.has(parsed.command)) {
    process.stderr.write('Unknown command: ' + parsed.command + '\n');
    printHelp();
    return { exitCode: 1 };
  }

  // Commands requiring a Hub endpoint and appId
  const { resolveCliHubEndpoint } = require('./resolveEndpoint');

  if (!parsed.appId) {
    process.stderr.write('--app-id is required (or set DEBUG_TOOLKIT_APP_ID)\n');
    return { exitCode: 2 };
  }

  const resolved = await resolveCliHubEndpoint({
    explicitEndpoint: parsed.hub,
    projectEndpoint: parsed.endpoint,
  });
  if (!resolved.endpoint) {
    const tried = resolved.attempted.length > 0
      ? resolved.attempted.join(', ')
      : '(no candidates)';
    process.stderr.write(
      `No compatible Hub found. Tried: ${tried}\n`
      + 'Pass --hub <url> for a specific Hub, or --endpoint <url> as the project default.\n',
    );
    return { exitCode: 2 };
  }
  parsed.endpoint = normalizeEndpoint(resolved.endpoint) || resolved.endpoint;

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

module.exports = { main, parseArgs, printHelp, printHubHelp };
