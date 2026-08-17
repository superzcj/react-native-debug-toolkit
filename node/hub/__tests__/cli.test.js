'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveDevOptions } = require('../src/cli/commands/hubStart');
const { initSkillCommand } = require('../src/cli/commands/initSkill');
const { main } = require('../src/cli/main');

describe('Hub development and AI setup', () => {
  it('starts local development on port 3800 without exposing network parameters', () => {
    const options = resolveDevOptions({}, '/workspace/app');

    expect(options).toMatchObject({
      bind: '0.0.0.0',
      port: 3800,
      dataDir: '/workspace/app/.debug-toolkit/hub',
    });
  });

  it('rejects removed hub install and update commands', async () => {
    const install = await main(['hub', 'install', '--url', 'http://10.20.4.10:3800']);
    const update = await main(['hub', 'update']);

    expect(install.exitCode).toBe(1);
    expect(update.exitCode).toBe(1);
  });

  it('initializes the repository Skill and its AI discovery instruction', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-skill-'));
    try {
      const first = await initSkillCommand({ targetDir });
      const second = await initSkillCommand({ targetDir });
      const skillPath = path.join(targetDir, '.agents/skills/react-native-debug-toolkit/SKILL.md');
      const agentsPath = path.join(targetDir, 'AGENTS.md');

      expect(first).toMatchObject({ status: 'current', exitCode: 0 });
      expect(second).toMatchObject({ status: 'current', exitCode: 0 });
      const skill = fs.readFileSync(skillPath, 'utf8');
      expect(skill).toContain('runtime diagnostics');
      expect(skill).toContain('npx --no-install debug-toolkit diagnose');
      expect(skill).toContain('--hub');
      expect(skill).not.toContain('DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT');
      expect(fs.readFileSync(agentsPath, 'utf8')).toContain('.agents/skills/react-native-debug-toolkit/SKILL.md');
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

const diagnose = require('../src/cli/commands/diagnose');
const hubStart = require('../src/cli/commands/hubStart');
const { parseArgs } = require('../src/cli/main');

describe('CLI parseArgs and diagnose dispatch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT;
  });

  it('parses the new diagnose, init, and tail options', () => {
    const parsed = parseArgs([
      'diagnose',
      '--at', '2026-08-17T10:32:00+08:00',
      '--prefer-stale',
      '--target-match', 'iPhone 15',
      '--resume-token', 'opaque-token',
      '--check',
      '--update',
      '--duration-ms', '1500',
    ]);
    expect(parsed).toMatchObject({
      command: 'diagnose',
      at: '2026-08-17T10:32:00+08:00',
      preferStale: true,
      targetMatch: 'iPhone 15',
      resumeToken: 'opaque-token',
      check: true,
      update: true,
      durationMs: 1500,
    });
  });

  it('dispatches diagnose before the legacy --app-id guard and prints JSON', async () => {
    const spy = jest.spyOn(diagnose, 'diagnoseCommand').mockResolvedValue({
      result: {
        schemaVersion: 1,
        state: 'unavailable',
        code: 'INVALID_ARGUMENT',
        error: { message: 'mock', attempted: [{ field: 'argv', message: 'mock' }] },
      },
      exitCode: 2,
    });
    const writes = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const result = await main(['diagnose']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(writes.join(''))).toMatchObject({
      state: 'unavailable',
      code: 'INVALID_ARGUMENT',
    });
  });

  it.each([
    ['--hub'],
    ['--endpoint'],
    ['--app-id'],
    ['--session'],
    ['--at'],
    ['--since'],
    ['--until'],
    ['--target-match'],
    ['--resume-token'],
  ])('rejects diagnose %s without a value', async (flag) => {
    const spy = jest.spyOn(diagnose, 'diagnoseCommand');
    const writes = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const result = await main(['diagnose', flag]);
    expect(spy).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(writes.join(''))).toMatchObject({
      state: 'unavailable',
      code: 'INVALID_ARGUMENT',
    });
  });

  it('binds hub dev to the loopback override endpoint', async () => {
    process.env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT = 'http://127.0.0.1:39111';
    const start = jest.spyOn(hubStart, 'hubStartCommand').mockResolvedValue({ ok: true, exitCode: 0 });
    const result = await main(['hub', 'dev']);
    expect(result.exitCode).toBe(0);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      bind: '127.0.0.1',
      port: 39111,
      advertiseUrl: 'http://127.0.0.1:39111',
      localHubEndpoint: 'http://127.0.0.1:39111',
    }));
  });

  it('rejects a non-loopback local Hub override before startup', async () => {
    process.env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT = 'http://10.0.0.2:3800';
    const start = jest.spyOn(hubStart, 'hubStartCommand').mockResolvedValue({ ok: true, exitCode: 0 });
    const result = await main(['hub', 'dev']);
    expect(start).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(2);
  });
});

