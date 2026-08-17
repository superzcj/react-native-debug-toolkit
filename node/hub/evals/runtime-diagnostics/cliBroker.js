'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const EXEC_PREFIX = ['npx', '--no-install', 'debug-toolkit'];
const ALLOWED_SUBCOMMANDS = new Set(['diagnose', 'context', 'inspect', 'tail', 'status', 'hub']);
const VALUE_FLAGS = new Set([
  '--hub', '--endpoint', '--app-id', '--session', '--at', '--since', '--until',
  '--resume-token', '--target-match', '--duration-ms', '--time-basis',
]);
const BOOLEAN_FLAGS = new Set(['--allow-stale', '--prefer-stale', '--json', '--follow']);

function normalizeEndpoint(value) {
  if (typeof value !== 'string' || !value) return '';
  return value.replace(/\/$/, '');
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildWrapperSource(queueDir) {
  return `#!/usr/bin/env node
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const queueDir = ${JSON.stringify(queueDir)};
const wrapperPath = __filename;
const wrapperHash = crypto.createHash('sha256').update(fs.readFileSync(wrapperPath)).digest('hex');
const requestId = \`\${process.pid}-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
const reqPath = path.join(queueDir, \`request-\${requestId}.json\`);
const resPath = path.join(queueDir, \`response-\${requestId}.json\`);
fs.writeFileSync(reqPath, JSON.stringify({
  id: requestId,
  argv: process.argv.slice(1),
  ppid: process.ppid,
  timestamp: Date.now(),
  wrapperHash,
  env: {
    DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: process.env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT || undefined,
    DEBUG_TOOLKIT_HUB_ENDPOINT: process.env.DEBUG_TOOLKIT_HUB_ENDPOINT || undefined,
  },
}));
const deadline = Date.now() + 120000;
while (!fs.existsSync(resPath)) {
  if (Date.now() > deadline) {
    process.stderr.write('eval wrapper timeout waiting for broker\\n');
    process.exit(124);
  }
  const waitUntil = Date.now() + 50;
  while (Date.now() < waitUntil) {}
}
const response = JSON.parse(fs.readFileSync(resPath, 'utf8'));
fs.unlinkSync(resPath);
if (response.stdout) process.stdout.write(response.stdout);
if (response.stderr) process.stderr.write(response.stderr);
process.exit(response.status ?? 1);
`;
}

function sanitizeEnv(env = {}) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value != null && value !== ''));
}

function mergeEnv(base, extra = {}) {
  return { ...base, ...sanitizeEnv(extra) };
}

function createCliBroker(options = {}) {
  const {
    queueDir,
    binPath,
    checkoutRoot = path.dirname(path.dirname(binPath)),
    allowedEndpoints = [],
  } = options;

  fs.mkdirSync(queueDir, { recursive: true });

  const journal = [];
  const owned = new Map();
  let allowed = new Set(allowedEndpoints.map(normalizeEndpoint));
  let closed = false;
  let pollTimer = null;
  let activeWrapperHash = null;

  function setAllowedEndpoints(endpoints) {
    allowed = new Set(endpoints.map(normalizeEndpoint));
  }

  function writeResponse(id, payload) {
    fs.writeFileSync(path.join(queueDir, `response-${id}.json`), JSON.stringify(payload));
  }

  function validateArgv(argv) {
    if (!Array.isArray(argv)) {
      return { ok: false, message: 'argv must be an array' };
    }
    if (argv.length < EXEC_PREFIX.length + 1) {
      return { ok: false, message: 'argv too short' };
    }
    for (let i = 0; i < EXEC_PREFIX.length; i += 1) {
      if (argv[i] !== EXEC_PREFIX[i]) {
        return { ok: false, message: 'invalid executable prefix' };
      }
    }
    const subcommand = argv[EXEC_PREFIX.length];
    if (!ALLOWED_SUBCOMMANDS.has(subcommand)) {
      return { ok: false, message: `unknown subcommand: ${subcommand}` };
    }
    const seen = new Set();
    for (let i = EXEC_PREFIX.length + 1; i < argv.length; i += 1) {
      const token = argv[i];
      if (token === 'dev' && subcommand === 'hub') {
        continue;
      }
      if (!token.startsWith('--')) {
        return { ok: false, message: `unexpected bare token: ${token}` };
      }
      if (seen.has(token)) {
        return { ok: false, message: `duplicate flag: ${token}` };
      }
      seen.add(token);
      if (BOOLEAN_FLAGS.has(token)) {
        continue;
      }
      if (VALUE_FLAGS.has(token)) {
        const value = argv[i + 1];
        if (typeof value !== 'string' || !value) {
          return { ok: false, message: `missing value for ${token}` };
        }
        if ((token === '--hub' || token === '--endpoint')
          && !allowed.has(normalizeEndpoint(value))) {
          return { ok: false, message: `endpoint not allowed: ${value}` };
        }
        i += 1;
        continue;
      }
      return { ok: false, message: `unknown flag: ${token}` };
    }
    return { ok: true, subcommand };
  }

  async function probeReady(endpoint) {
    const url = new URL(`${endpoint}/ready`);
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async function isPortClosed(port) {
    return new Promise((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/ready', timeout: 500 }, (res) => {
        res.resume();
        resolve(false);
      });
      req.on('error', () => resolve(true));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(true);
      });
    });
  }

  function registerOwned(entry) {
    owned.set(entry.pid, entry);
  }

  async function executeArgv(argv, env = {}) {
    if (closed) {
      return { status: 2, stdout: '', stderr: 'broker closed' };
    }
    const validation = validateArgv(argv);
    if (!validation.ok) {
      return { status: 2, stdout: '', stderr: validation.message };
    }

    const entry = {
      argv: argv.slice(),
      timestamp: Date.now(),
      ppid: process.pid,
    };
    journal.push(entry);

    if (validation.subcommand === 'hub' && argv[EXEC_PREFIX.length + 1] === 'dev') {
      return startOwnedHub(argv, env, entry);
    }

    return spawnCheckout(argv, env, entry);
  }

  function spawnCheckout(argv, env, entry) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [binPath, ...argv.slice(EXEC_PREFIX.length)], {
        cwd: checkoutRoot,
        env: mergeEnv(process.env, env),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      entry.childPid = child.pid;
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => {
        entry.exitCode = code;
        entry.stdout = stdout;
        entry.stderr = stderr;
        resolve({ status: code ?? 1, stdout, stderr });
      });
    });
  }

  async function startOwnedHub(argv, env, entry) {
    const localEndpoint = normalizeEndpoint(env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT);
    if (!localEndpoint || !allowed.has(localEndpoint)) {
      return { status: 2, stdout: '', stderr: 'owned hub endpoint not allowed' };
    }
    const dataDir = env.DEBUG_TOOLKIT_EVAL_HUB_DATA_DIR;
    if (!dataDir) {
      return { status: 2, stdout: '', stderr: 'missing owned hub data directory' };
    }

    const child = spawn(process.execPath, [binPath, 'hub', 'dev'], {
      cwd: checkoutRoot,
      env: mergeEnv(process.env, {
        ...env,
        DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: localEndpoint,
      }),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    const port = Number(new URL(localEndpoint).port);
    const ownedEntry = {
      pid: child.pid,
      process: child,
      port,
      endpoint: localEndpoint,
      kind: 'hub-dev',
      dataDir,
    };
    registerOwned(ownedEntry);
    entry.childPid = child.pid;
    entry.ownedHub = true;

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await probeReady(localEndpoint)) {
        return { status: 0, stdout: '', stderr: '' };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { status: 1, stdout: '', stderr: 'owned hub failed ready probe' };
  }

  async function handleRequest(request) {
    if (closed) {
      writeResponse(request.id, { status: 2, stdout: '', stderr: 'broker closed' });
      return;
    }
    if (activeWrapperHash && request.wrapperHash !== activeWrapperHash) {
      writeResponse(request.id, { status: 2, stdout: '', stderr: 'wrapper hash mismatch' });
      return;
    }
    const cliTail = request.argv.slice(1);
    const result = await executeArgv([...EXEC_PREFIX, ...cliTail], sanitizeEnv(request.env));
    const mapped = {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    writeResponse(request.id, mapped);
  }

  async function pollQueue() {
    if (closed) return;
    const files = fs.readdirSync(queueDir).filter((name) => name.startsWith('request-'));
    for (const file of files) {
      const fullPath = path.join(queueDir, file);
      let request;
      try {
        request = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch {
        fs.unlinkSync(fullPath);
        continue;
      }
      await handleRequest(request);
      fs.unlinkSync(fullPath);
    }
  }

  function startPolling(wrapperHash) {
    activeWrapperHash = wrapperHash;
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      pollQueue().catch(() => {});
    }, 25);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function terminateProcess(entry, signal) {
    try {
      process.kill(-entry.pid, signal);
    } catch {
      try {
        process.kill(entry.pid, signal);
      } catch {
        // already dead
      }
    }
  }

  async function cleanup() {
    closed = true;
    stopPolling();
    const entries = [...owned.values()];
    for (const entry of entries) {
      await terminateProcess(entry, 'SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 500));
    for (const entry of entries) {
      if (!(await isPortClosed(entry.port))) {
        await terminateProcess(entry, 'SIGKILL');
      }
    }
    await new Promise((r) => setTimeout(r, 200));
    owned.clear();
    for (const file of fs.readdirSync(queueDir)) {
      if (file.startsWith('request-') || file.startsWith('response-')) {
        fs.unlinkSync(path.join(queueDir, file));
      }
    }
  }

  function installWrapper(workspaceDir) {
    const binDir = path.join(workspaceDir, 'node_modules/.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const wrapperPath = path.join(binDir, 'debug-toolkit');
    fs.writeFileSync(wrapperPath, buildWrapperSource(queueDir), { mode: 0o755 });
    const wrapperHash = hashFile(wrapperPath);
    return { wrapperPath, wrapperHash };
  }

  async function invokeThroughWrapper(workspaceDir, argv, env = {}) {
    const { wrapperPath, wrapperHash } = installWrapper(workspaceDir);
    startPolling(wrapperHash);
    return new Promise((resolve) => {
      const child = spawn(wrapperPath, argv.slice(EXEC_PREFIX.length), {
        cwd: workspaceDir,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => {
        resolve({ status: code ?? 1, stdout, stderr, wrapperPath, wrapperHash });
      });
    });
  }

  return {
    journal,
    queueDir,
    validateArgv,
    executeArgv,
    installWrapper,
    invokeThroughWrapper,
    setAllowedEndpoints,
    startPolling,
    stopPolling,
    cleanup,
    getOwnedProcesses: () => [...owned.values()],
    isPortClosed,
    probeReady,
  };
}

module.exports = {
  createCliBroker,
  normalizeEndpoint,
  hashFile,
  EXEC_PREFIX,
};
