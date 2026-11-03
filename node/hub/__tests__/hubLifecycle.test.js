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

function launch(port) {
  child = spawn(process.execPath, [entry, 'hub', 'dev', '--port', String(port), '--bind', '127.0.0.1'], {
    cwd: projectRoot,
    env: { ...process.env, PATH: path.join(projectRoot, 'no-adb'), DEBUG_TOOLKIT_HUB_WORKER: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  return child;
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-hub-lifecycle-'));
  initializeState(projectRoot);
});

afterEach(async () => {
  watcher?.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const closed = once(child, 'close');
    child.kill('SIGTERM');
    await closed;
  }
  child = undefined;
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('Hub command activates its project and closes it on shutdown', async () => {
  const port = await reservePort();
  const started = waitForState(true);
  launch(port);
  const state = await started;
  expect(state).toMatchObject({ enabled: true, ownerPid: child.pid, port });
  expect(state.hubPid).not.toBe(child.pid);
  const response = await fetch(`http://127.0.0.1:${port}/ready`);
  expect(await response.json()).toMatchObject({ ok: true, name: 'react-native-debug-toolkit-hub' });

  const stopped = waitForState(false);
  const exited = once(child, 'close');
  child.kill('SIGTERM');
  expect(await stopped).toEqual({ enabled: false });
  await exited;
});

test('an abruptly stopped supervisor causes its Hub to clear activation', async () => {
  const started = waitForState(true);
  launch(await reservePort());
  await started;
  const stopped = waitForState(false);
  const exited = once(child, 'close');
  child.kill('SIGKILL');
  expect(await stopped).toEqual({ enabled: false });
  expect(await exited).toEqual([null, 'SIGKILL']);
});

test('an abruptly stopped Hub worker causes its supervisor to clear activation', async () => {
  const started = waitForState(true);
  launch(await reservePort());
  const state = await started;
  const stopped = waitForState(false);
  const exited = once(child, 'close');
  process.kill(state.hubPid, 'SIGKILL');
  expect(await stopped).toEqual({ enabled: false });
  await exited;
});

test('a Hub that cannot bind does not activate the project', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    launch(server.address().port);
    const [code] = await once(child, 'close');
    expect(code).toBe(1);
    expect(readState(projectRoot)).toEqual({ enabled: false });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
