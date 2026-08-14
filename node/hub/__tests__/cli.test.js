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

      expect(first).toMatchObject({ ok: true, created: true });
      expect(second).toMatchObject({ ok: true, created: false });
      const skill = fs.readFileSync(skillPath, 'utf8');
      expect(skill).toContain('Runtime Diagnostics');
      expect(skill).toContain('npx --no-install debug-toolkit status');
      expect(skill).toContain('127.0.0.1:3800');
      expect(skill).toContain('--hub');
      expect(fs.readFileSync(agentsPath, 'utf8')).toContain('.agents/skills/react-native-debug-toolkit/SKILL.md');
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
