'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildInstallPlan, readInstalledSettings, LABEL, LAUNCH_SHIM_PATH,
} = require('../src/cli/commands/hubInstall');
const { resolveDevOptions } = require('../src/cli/commands/hubStart');
const { initSkillCommand } = require('../src/cli/commands/initSkill');
const { main } = require('../src/cli/main');

describe('Hub system installer', () => {
  it('uses a stable launcher shim and preserves the recorded service identity', () => {
    const plan = buildInstallPlan({
      rootDir: '/tmp/dt-hub',
      bind: '10.20.4.10',
      advertiseUrl: 'http://10.20.4.10:3800',
      identity: { username: 'toolkit', uid: 501, gid: 20 },
    });

    expect(plan.currentPath).toBe('/tmp/dt-hub/current');
    expect(plan.plist).toContain(`<string>${LAUNCH_SHIM_PATH}</string>`);
    expect(plan.plist).toContain(`<string>${LABEL}</string>`);
    expect(plan.plist).toContain('<string>toolkit</string>');
    expect(plan.port).toBe(3800);
    expect(plan.plist).toContain('<key>DEBUG_TOOLKIT_HUB_PORT</key><string>3800</string>');
    expect(plan.launcher).toContain('"$ROOT/current/node" "$ROOT/current/hub.js"');
  });

  it('derives the bind address and port from the one public URL', () => {
    const plan = buildInstallPlan({
      rootDir: '/tmp/dt-hub',
      url: 'http://10.20.4.10:3800',
      identity: { username: 'toolkit', uid: 501, gid: 20 },
    });

    expect(plan).toMatchObject({
      bind: '10.20.4.10',
      port: 3800,
      advertiseUrl: 'http://10.20.4.10:3800',
    });
  });

  it('requires the one public URL instead of silently installing localhost', async () => {
    const result = await main(['hub', 'install']);

    expect(result).toMatchObject({ ok: false, exitCode: 2 });
  });

  it('loads the public URL saved by a previous install for an update', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-installed-hub-'));
    fs.writeFileSync(path.join(rootDir, 'install.json'), JSON.stringify({
      username: 'toolkit', uid: 501, gid: 20,
      bind: '10.20.4.10', port: 3800,
      advertiseUrl: 'http://10.20.4.10:3800',
      dataDir: path.join(rootDir, 'data'),
    }));

    try {
      expect(readInstalledSettings(rootDir)).toMatchObject({
        bind: '10.20.4.10',
        port: 3800,
        advertiseUrl: 'http://10.20.4.10:3800',
      });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe('Hub development and AI setup', () => {
  it('starts local development on port 3800 without exposing network parameters', () => {
    const options = resolveDevOptions({}, '/workspace/app');

    expect(options).toMatchObject({
      bind: '0.0.0.0',
      port: 3800,
      dataDir: '/workspace/app/.debug-toolkit/hub',
    });
  });

  it('initializes the repository Skill and its AI discovery instruction', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-skill-'));
    try {
      const first = await initSkillCommand({ targetDir });
      const second = await initSkillCommand({ targetDir });
      const skillPath = path.join(targetDir, '.agents/skills/react-native-debug-toolkit/SKILL.md');
      const agentsPath = path.join(targetDir, 'AGENTS.md');

      expect(first).toMatchObject({ ok: true, created: true });
      expect(second).toMatchObject({ ok: true, created: false });
      const skill = fs.readFileSync(skillPath, 'utf8');
      expect(skill).toContain('Runtime Diagnostics');
      expect(skill).toContain('npx debug-toolkit status');
      expect(skill).toContain('127.0.0.1:3800');
      expect(skill).toContain('--hub');
      expect(fs.readFileSync(agentsPath, 'utf8')).toContain('.agents/skills/react-native-debug-toolkit/SKILL.md');
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe('Hub adb reverse helper', () => {
  it('exports tryAdbReverse for local development startup', () => {
    const { tryAdbReverse } = require('../src/cli/commands/hubStart');
    expect(typeof tryAdbReverse).toBe('function');
  });
});
