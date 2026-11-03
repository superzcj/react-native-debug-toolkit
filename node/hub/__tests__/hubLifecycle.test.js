const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { initializeState, readState, statePath } = require('../../metro/activation');

const entry = path.resolve(__dirname, '../../../bin/debug-toolkit.js');
let projectRoot;
let child;
let watcher;
let children;

function waitForState(enabled) {
  return new Promise((resolve) => {
    watcher = fs.watch(path.dirname(statePath(projectRoot)), () => {
      const state = readState(projectRoot);
      if (state?.enabled === enabled) { watcher.close(); watcher = undefined; resolve(state); }
    });
  });
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function reservePorts() {
  const servers = [net.createServer(), net.createServer()];
  await Promise.all(servers.map((server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))));
  const ports = servers.map((server) => server.address().port);
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  return ports;
}

function launch(port) {
  const env = { ...process.env, PATH: path.join(projectRoot, 'no-adb'), DEBUG_TOOLKIT_HUB_WORKER: '' };
  delete env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT;
  child = spawn(process.execPath, [entry, 'hub', 'dev', '--port', String(port), '--bind', '127.0.0.1'], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const launched = child;
  launched.stdout.resume();
  launched.stderrOutput = '';
  launched.stderr.on('data', (data) => { launched.stderrOutput += data; });
  return launched;
}

function waitForStart(state, process) {
  return Promise.race([
    state,
    once(process, 'close').then(([code, signal]) => {
      throw new Error(`Hub exited before activation (${code ?? signal}): ${process.stderrOutput}`);
    }),
  ]);
}

beforeEach(() => {
  children = [];
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-hub-lifecycle-'));
  initializeState(projectRoot);
});

afterEach(async () => {
  watcher?.close();
  for (const process of children) {
    if (process.exitCode === null && process.signalCode === null) {
      const closed = once(process, 'close');
      process.kill('SIGTERM');
      await closed;
    }
  }
  child = undefined;
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('Hub command activates its project and closes it on shutdown', async () => {
  const port = await reservePort();
  const started = waitForState(true);
  launch(port);
  const state = await waitForStart(started, child);
  expect(state).toMatchObject({ enabled: true, ownerPid: child.pid, port });
  expect(state.hubPid).not.toBe(child.pid);
  const response = await fetch(`http://127.0.0.1:${port}/ready`);
  expect(await response.json()).toMatchObject({ ok: true, name: 'react-native-debug-toolkit-hub' });

  const stopped = waitForState(false);
  const exited = once(child, 'close');
  child.kill('SIGTERM');
  expect(await stopped).toEqual({ enabled: false });
  await exited;
  expect(fs.existsSync(path.join(projectRoot, '.debug-toolkit', 'hub.lock'))).toBe(false);

  const restarted = waitForState(true);
  const next = launch(port);
  expect(await waitForStart(restarted, next)).toMatchObject({ enabled: true, ownerPid: next.pid, port });
});

test('an abruptly stopped supervisor causes its Hub to clear activation', async () => {
  const started = waitForState(true);
  launch(await reservePort());
  await waitForStart(started, child);
  const stopped = waitForState(false);
  const exited = once(child, 'close');
  child.kill('SIGKILL');
  expect(await stopped).toEqual({ enabled: false });
  expect(await exited).toEqual([null, 'SIGKILL']);
});

test('an abruptly stopped Hub worker causes its supervisor to clear activation', async () => {
  const started = waitForState(true);
  launch(await reservePort());
  const state = await waitForStart(started, child);
  const stopped = waitForState(false);
  const exited = once(child, 'close');
  process.kill(state.hubPid, 'SIGKILL');
  expect(await stopped).toEqual({ enabled: false });
  await exited;
});

test('rejects another Hub for the same project without disturbing the running Hub', async () => {
  const [firstPort, secondPort] = await reservePorts();
  const started = waitForState(true);
  const first = launch(firstPort);
  const state = await waitForStart(started, first);
  const second = launch(secondPort);
  const [code] = await once(second, 'close');

  expect(code).toBe(1);
  expect(second.stderrOutput).toMatch(/Hub is already running for this project/);
  expect(readState(projectRoot)).toEqual(state);
  expect((await fetch(`http://127.0.0.1:${firstPort}/ready`)).ok).toBe(true);
});

test('only one concurrent Hub can recover an abandoned project lock', async () => {
  fs.writeFileSync(path.join(projectRoot, '.debug-toolkit', 'hub.lock'), JSON.stringify({ ownerPid: -1, hubPid: -1 }));
  const ports = await reservePorts();
  const started = waitForState(true);
  const first = launch(ports[0]);
  const firstExit = once(first, 'close');
  const second = launch(ports[1]);
  const secondExit = once(second, 'close');
  const state = await Promise.race([
    started,
    Promise.all([firstExit, secondExit]).then(() => { throw new Error('Both Hub starts failed'); }),
  ]);
  const winner = state.ownerPid === first.pid ? first : second;
  const loser = winner === first ? second : first;
  const [code] = await (loser === first ? firstExit : secondExit);

  expect(state.ownerPid).toBe(winner.pid);
  expect(code).toBe(1);
  expect(loser.stderrOutput).toMatch(/Hub (is already running|lock recovery is in progress)/);
  expect(readState(projectRoot)).toEqual(state);
  expect((await fetch(`http://127.0.0.1:${state.port}/ready`)).ok).toBe(true);
});

test('a Hub that cannot bind does not activate the project', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    launch(server.address().port);
    const [code] = await once(child, 'close');
    expect(code).toBe(1);
    expect(readState(projectRoot)).toEqual({ enabled: false });
    expect(fs.existsSync(path.join(projectRoot, '.debug-toolkit', 'hub.lock'))).toBe(false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
