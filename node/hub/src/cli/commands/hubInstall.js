'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HUB_VERSION, DEFAULT_PORT } = require('../../protocol/constants');
const { normalizeEndpoint } = require('../../protocol/validation');

const ROOT_DIR = '/Users/Shared/ReactNativeDebugToolkitHub';
const PLIST_PATH = '/Library/LaunchDaemons/com.reactnativedebugtoolkit.hub.plist';
const LAUNCH_SHIM_PATH = '/usr/local/libexec/debug-toolkit-hub-launch';
const LABEL = 'com.reactnativedebugtoolkit.hub';

function xml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function readIdentity(rootDir) {
  try {
    const current = JSON.parse(fs.readFileSync(path.join(rootDir, 'install.json'), 'utf8'));
    if (current?.uid !== undefined && current?.gid !== undefined && current?.username) return current;
  } catch {}
  const user = os.userInfo();
  return { username: user.username, uid: process.getuid?.(), gid: process.getgid?.() };
}

function buildInstallPlan(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const bind = options.bind || '127.0.0.1';
  const port = options.port || DEFAULT_PORT;
  const advertiseUrl = normalizeEndpoint(options.advertiseUrl || `http://${bind}:${port}`);
  if (!advertiseUrl) throw new Error('Invalid --advertise-url');
  const identity = options.identity || readIdentity(rootDir);
  const runtimeDir = path.join(rootDir, 'runtime', HUB_VERSION);
  const currentPath = path.join(rootDir, 'current');
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const logsDir = path.join(rootDir, 'logs');
  const homeDir = path.join(rootDir, 'home');
  const launcher = `#!/bin/sh\nset -eu\nROOT=${JSON.stringify(rootDir)}\nexec "$ROOT/current/node" "$ROOT/current/hub.js"\n`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${LABEL}</string>\n<key>ProgramArguments</key><array><string>${xml(LAUNCH_SHIM_PATH)}</string></array>\n<key>UserName</key><string>${xml(identity.username)}</string>\n<key>WorkingDirectory</key><string>${xml(rootDir)}</string>\n<key>EnvironmentVariables</key><dict>\n<key>HOME</key><string>${xml(homeDir)}</string>\n<key>PATH</key><string>/usr/bin:/bin</string>\n<key>DEBUG_TOOLKIT_HUB_BIND</key><string>${xml(bind)}</string>\n<key>DEBUG_TOOLKIT_HUB_PORT</key><string>${port}</string>\n<key>DEBUG_TOOLKIT_HUB_DATA_DIR</key><string>${xml(dataDir)}</string>\n<key>DEBUG_TOOLKIT_HUB_ADVERTISE_URL</key><string>${xml(advertiseUrl)}</string>\n</dict>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer>\n<key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string>\n</dict></plist>\n`;
  return { rootDir, runtimeDir, currentPath, dataDir, logsDir, homeDir, identity, bind, port, advertiseUrl, launcher, plist };
}

function runSudo(args) {
  childProcess.execFileSync('/usr/bin/sudo', args, { stdio: 'inherit' });
}

async function hubInstallCommand(options) {
  if (!options.system) {
    process.stderr.write('hub install requires --system\n');
    return { ok: false, exitCode: 2 };
  }
  let plan;
  try { plan = buildInstallPlan(options); }
  catch (error) {
    process.stderr.write(`${error.message}\n`);
    return { ok: false, exitCode: 2 };
  }
  if (options.dryRun) {
    process.stdout.write(JSON.stringify({ ok: true, dryRun: true, ...plan, launcher: undefined, plist: undefined }, null, 2) + '\n');
    return { ok: true, dryRun: true, exitCode: 0 };
  }
  if (process.platform !== 'darwin') {
    process.stderr.write('hub install --system is supported on macOS only\n');
    return { ok: false, exitCode: 2 };
  }
  if (!Number.isInteger(process.versions.node ? Number(process.versions.node.split('.')[0]) : NaN) || Number(process.versions.node.split('.')[0]) < 20) {
    process.stderr.write('Hub installation requires Node.js 20 or newer\n');
    return { ok: false, exitCode: 2 };
  }
  if (fs.existsSync(plan.runtimeDir) && !options.replace) {
    process.stderr.write(`Runtime ${HUB_VERSION} already exists. Use --replace to reinstall it.\n`);
    return { ok: false, exitCode: 1 };
  }

  const sourceDir = path.resolve(__dirname, '../..');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-hub-'));
  const stageRuntime = path.join(staging, 'runtime');
  const stageLauncher = path.join(staging, 'debug-toolkit-hub-launch');
  const stagePlist = path.join(staging, `${LABEL}.plist`);
  const stageInstall = path.join(staging, 'install.json');
  try {
    fs.cpSync(sourceDir, stageRuntime, { recursive: true });
    fs.copyFileSync(process.execPath, path.join(stageRuntime, 'node'));
    fs.writeFileSync(stageLauncher, plan.launcher, { mode: 0o755 });
    fs.writeFileSync(stagePlist, plan.plist, { mode: 0o644 });
    fs.writeFileSync(stageInstall, JSON.stringify({ ...plan.identity, installedAt: new Date().toISOString(), version: HUB_VERSION }, null, 2));

    runSudo(['mkdir', '-p', path.join(plan.rootDir, 'runtime'), plan.dataDir, plan.logsDir, plan.homeDir, '/usr/local/libexec']);
    runSudo(['rm', '-rf', plan.runtimeDir]);
    runSudo(['cp', '-R', stageRuntime, plan.runtimeDir]);
    runSudo(['cp', stageInstall, path.join(plan.rootDir, 'install.json')]);
    runSudo(['ln', '-sfn', plan.runtimeDir, plan.currentPath]);
    runSudo(['install', '-m', '0755', stageLauncher, LAUNCH_SHIM_PATH]);
    runSudo(['install', '-m', '0644', stagePlist, PLIST_PATH]);
    runSudo(['chown', '-R', `${plan.identity.uid}:${plan.identity.gid}`, plan.rootDir]);
    runSudo(['chown', 'root:wheel', path.join(plan.rootDir, 'install.json')]);
    try { runSudo(['launchctl', 'bootout', `system/${LABEL}`]); } catch {}
    runSudo(['launchctl', 'bootstrap', 'system', PLIST_PATH]);
    process.stderr.write(`Installed ${LABEL}; Hub will listen at ${plan.advertiseUrl}\n`);
    return { ok: true, endpoint: plan.advertiseUrl, exitCode: 0 };
  } catch (error) {
    process.stderr.write(`Hub installation failed: ${error.message}\n`);
    return { ok: false, exitCode: 1 };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { hubInstallCommand, buildInstallPlan, ROOT_DIR, PLIST_PATH, LAUNCH_SHIM_PATH, LABEL };
