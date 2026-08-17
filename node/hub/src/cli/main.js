'use strict';

const { normalizeEndpoint } = require('../protocol/validation');
const { finalizeDiagnoseResult, formatDiagnoseContractHelp } = require('./diagnoseResultSchema');

function isFlagToken(value) {
  return typeof value === 'string' && value.startsWith('--');
}

function readOption(args, name, fallback, errors) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  if (idx >= args.length - 1 || isFlagToken(args[idx + 1])) {
    if (errors) {
      errors.push({ field: name.replace(/^--/, ''), message: `${name} requires a value` });
    }
    return fallback;
  }
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function readIntegerOption(args, name, errors) {
  const idx = args.indexOf(name);
  if (idx < 0) return undefined;
  if (idx >= args.length - 1 || isFlagToken(args[idx + 1])) {
    if (errors) {
      errors.push({ field: name.replace(/^--/, ''), message: `${name} requires an integer value` });
    }
    return undefined;
  }
  const raw = args[idx + 1];
  if (!/^-?\d+$/.test(raw)) {
    if (errors) {
      errors.push({ field: name.replace(/^--/, ''), message: `${name} must be an integer` });
    }
    return undefined;
  }
  return Number(raw);
}

function parseArgs(args) {
  const command = args[0] || '';
  const subcommand = args[1] || '';
  const argumentErrors = [];
  const portValue = readOption(args, '--port', undefined, argumentErrors);
  return {
    command,
    subcommand,
    argumentErrors,
    endpoint: readOption(args, '--endpoint', process.env.DEBUG_TOOLKIT_HUB_ENDPOINT, argumentErrors),
    hub: readOption(args, '--hub', undefined, argumentErrors),
    appId: readOption(args, '--app-id', process.env.DEBUG_TOOLKIT_APP_ID, argumentErrors),
    session: readOption(args, '--session', undefined, argumentErrors),
    through: readOption(args, '--through', undefined, argumentErrors),
    since: readOption(args, '--since', undefined, argumentErrors),
    until: readOption(args, '--until', undefined, argumentErrors),
    sinceSequence: readOption(args, '--since-sequence', undefined, argumentErrors),
    at: readOption(args, '--at', undefined, argumentErrors),
    preferStale: hasFlag(args, '--prefer-stale'),
    targetMatch: readOption(args, '--target-match', undefined, argumentErrors),
    resumeToken: readOption(args, '--resume-token', undefined, argumentErrors),
    check: hasFlag(args, '--check'),
    update: hasFlag(args, '--update'),
    durationMs: readIntegerOption(args, '--duration-ms', argumentErrors),
    localHubEndpoint: process.env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT,
    allowStale: hasFlag(args, '--allow-stale'),
    follow: hasFlag(args, '--follow'),
    url: readOption(args, '--url', undefined, argumentErrors),
    bind: readOption(args, '--bind', undefined, argumentErrors),
    port: portValue === undefined ? undefined : parseInt(portValue, 10),
    dataDir: readOption(args, '--data-dir', undefined, argumentErrors),
    advertiseUrl: readOption(args, '--advertise-url', undefined, argumentErrors),
    help: hasFlag(args, '--help') || hasFlag(args, '-h'),
    json: hasFlag(args, '--json'),
    entryId: null,
  };
}

function printHelp() {
  process.stderr.write(
    'Usage: debug-toolkit <command> [options]\n\n'
    + 'Commands:\n'
    + '  hub dev                   Run a local Hub for App development\n'
    + '  init                      Enable AI runtime diagnostics in this repository\n'
    + '  diagnose                  Find Hub/App/Session and return bounded evidence\n'
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
    + '  --prefer-stale            Prefer stale Sessions for crash/history\n'
    + '  --json                    JSON output\n'
    + '  -h, --help                Show help\n'
    + '\n'
    + 'diagnose options:\n'
    + '  --at <iso>                Instant (expands to ±5 minutes, offset-bearing ISO)\n'
    + '  --since/--until <iso>     Explicit occurrence-time range\n'
    + '  --target-match <text>     Device/App/IP description after CONFIRM_TARGET\n'
    + '  --resume-token <token>    Opaque continuation from a previous result\n'
    + '\n'
    + 'tail options:\n'
    + '  --since-sequence <n>      Resume after this sequence\n'
    + '  --duration-ms <n>         Bound tail to 1000..300000 ms (default 60000)\n'
    + '  --follow                  --follow removes the time limit; 200-event and 2 MiB limits still apply\n'
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

function printDiagnoseHelp() {
  process.stderr.write(
    'Usage: debug-toolkit diagnose [options]\n\n'
    + 'Find the right Hub/App/Session and return bounded diagnostic evidence.\n'
    + 'diagnose is read-only.\n\n'
    + 'Options:\n'
    + '  --hub <url>               Use this Hub URL only\n'
    + '  --endpoint <url>          Project default Hub URL\n'
    + '  --app-id <id>             App identifier\n'
    + '  --session <id>            Session ID\n'
    + '  --at <iso>                Instant (offset-bearing ISO, ±5 minutes)\n'
    + '  --since/--until <iso>     Occurrence-time range\n'
    + '  --allow-stale             Allow stale Sessions\n'
    + '  --prefer-stale            Prefer stale Sessions\n'
    + '  --target-match <text>     Continuation answer after CONFIRM_TARGET\n'
    + '  --resume-token <token>    Opaque continuation token\n'
    + '\n'
    + formatDiagnoseContractHelp()
    + '\n'
  );
}

function invalidArgument(message, attempted = []) {
  return {
    schemaVersion: 1,
    state: 'unavailable',
    code: 'INVALID_ARGUMENT',
    error: { message, attempted },
  };
}

function writeDiagnoseResult(finalized) {
  process.stdout.write(JSON.stringify(finalized.result) + '\n');
  return { exitCode: finalized.exitCode };
}

function normalizeLocalHubOverride(raw) {
  if (raw == null || String(raw).trim() === '') {
    return { ok: true, value: undefined };
  }
  const normalized = normalizeEndpoint(String(raw));
  if (!normalized) {
    return { ok: false, message: 'DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT is invalid' };
  }
  return { ok: true, value: normalized };
}

function validateTailOptions(parsed) {
  const durationError = parsed.argumentErrors.find((item) => item.field === 'duration-ms');
  if (durationError) {
    return `INVALID_ARGUMENT: ${durationError.message}`;
  }
  if (parsed.follow && parsed.durationMs != null) {
    return 'INVALID_ARGUMENT: --duration-ms and --follow are mutually exclusive';
  }
  if (parsed.durationMs != null) {
    if (!Number.isInteger(parsed.durationMs) || parsed.durationMs < 1000 || parsed.durationMs > 300000) {
      return 'INVALID_ARGUMENT: --duration-ms must be an integer from 1000 through 300000';
    }
  }
  return null;
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
    else if (parsed.command === 'diagnose') printDiagnoseHelp();
    else printHelp();
    return { exitCode: 0 };
  }

  const localOverride = normalizeLocalHubOverride(parsed.localHubEndpoint);
  parsed.localHubEndpoint = localOverride.ok ? localOverride.value : parsed.localHubEndpoint;

  if (parsed.command === 'hub') {
    if (parsed.subcommand === 'dev') {
      const { hubStartCommand, resolveDevOptions } = require('./commands/hubStart');
      if (!localOverride.ok) {
        process.stderr.write(`INVALID_ARGUMENT: ${localOverride.message}\n`);
        return { exitCode: 2 };
      }
      parsed.localHubEndpoint = localOverride.value;
      try {
        return hubStartCommand(resolveDevOptions(parsed));
      } catch (err) {
        if (err && err.code === 'INVALID_ARGUMENT') {
          process.stderr.write(`INVALID_ARGUMENT: ${err.message}\n`);
          return { exitCode: 2 };
        }
        throw err;
      }
    }
    if (parsed.subcommand === 'start') {
      const { hubStartCommand } = require('./commands/hubStart');
      return hubStartCommand(parsed);
    }
    process.stderr.write('Unknown hub command. Use: hub dev\n');
    return { exitCode: 1 };
  }

  if (parsed.command === 'init' || parsed.command === 'init-skill') {
    const { initSkillCommand } = require('./commands/initSkill');
    const result = await initSkillCommand(parsed);
    if (parsed.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      process.stdout.write(`Skill ${result.status}\n`);
    }
    return { exitCode: result.exitCode };
  }

  if (parsed.command === 'diagnose') {
    if (!localOverride.ok) {
      return writeDiagnoseResult(finalizeDiagnoseResult(invalidArgument(localOverride.message, [{
        field: 'localHubEndpoint',
        message: localOverride.message,
      }])));
    }
    if (parsed.argumentErrors.length > 0) {
      const first = parsed.argumentErrors[0];
      return writeDiagnoseResult(finalizeDiagnoseResult(invalidArgument(first.message, [{
        field: first.field,
        message: first.message,
      }])));
    }
    const { diagnoseCommand } = require('./commands/diagnose');
    const finalized = await diagnoseCommand({
      hub: parsed.hub,
      endpoint: parsed.endpoint,
      appId: parsed.appId,
      session: parsed.session,
      at: parsed.at,
      since: parsed.since,
      until: parsed.until,
      allowStale: parsed.allowStale,
      preferStale: parsed.preferStale,
      targetMatch: parsed.targetMatch,
      resumeToken: parsed.resumeToken,
      localHubEndpoint: localOverride.value,
    });
    return writeDiagnoseResult(finalized);
  }

  if (parsed.command === 'tail') {
    const tailError = validateTailOptions(parsed);
    if (tailError) {
      process.stderr.write(`${tailError}\n`);
      return { exitCode: 2 };
    }
  }

  const hubReadCommands = new Set(['status', 'context', 'inspect', 'tail']);
  if (!hubReadCommands.has(parsed.command)) {
    process.stderr.write('Unknown command: ' + parsed.command + '\n');
    printHelp();
    return { exitCode: 1 };
  }

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

module.exports = { main, parseArgs, printHelp, printHubHelp, printDiagnoseHelp };
