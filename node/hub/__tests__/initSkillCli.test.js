'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  loadCanonicalSkill,
  inspectInstalledSkill,
  initSkillCommand,
  AGENT_START,
  AGENT_END,
  AGENT_DIRECTIVE,
} = require('../src/cli/commands/initSkill');

const BIN = path.join(__dirname, '../../../bin/debug-toolkit.js');
const LEGACY_PATH = path.join(__dirname, 'fixtures/skills/legacy-SKILL.md');
const MODIFIED_PATH = path.join(__dirname, 'fixtures/skills/modified-SKILL.md');
const BASELINE_PATH = path.join(__dirname, '../evals/runtime-diagnostics/baselines/legacy-SKILL.md');
const EXPECTED_LEGACY_SHA = '859e85eb72b863ad3c2891caff867603fb0f2887f429ff204797c119346687c9';

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  delete env.JEST_WORKER_ID;
  return env;
}

function runInit(cwd, args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 8000,
    env: childEnv(),
  });
}

function skillPath(dir) {
  return path.join(dir, '.agents/skills/react-native-debug-toolkit/SKILL.md');
}

function jsonKeys(payload) {
  return [
    'status',
    'installedVersion',
    'availableVersion',
    'skillPath',
    'suggestedCommand',
    'exitCode',
    'warnings',
  ].every((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

describe('legacy Skill baseline', () => {
  it('matches the frozen SHA-256 of generateSkillContent()', () => {
    const a = fs.readFileSync(LEGACY_PATH);
    const b = fs.readFileSync(BASELINE_PATH);
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(2711);
    expect(crypto.createHash('sha256').update(a).digest('hex')).toBe(EXPECTED_LEGACY_SHA);
  });
});

describe('canonical Skill source', () => {
  it('has valid frontmatter, one version marker, and a thin body', () => {
    const canonical = loadCanonicalSkill();
    const text = canonical.text;
    expect(text).toMatch(/^---\nname: react-native-debug-toolkit\n/);
    expect(text).toContain('description:');
    expect(text.match(/skill-template-version/g)).toHaveLength(1);
    const body = text.replace(/^---[\s\S]*?---\s*/, '').replace(/<!--[\s\S]*?-->/g, ' ');
    expect(body.trim().split(/\s+/).length).toBeLessThanOrEqual(450);
    expect(text).not.toMatch(/protocolVersion|HUB_VERSION|4\.0\.\d/);
    expect(text).toContain('conclusion');
    expect(text).toContain('evidence');
    expect(text).toContain('coverage');
    expect(text).toContain('nextStep');
    expect(text).toContain('untrusted');
    expect(text).toContain('trusted local/LAN');
    expect(text).toContain('never expose publicly');
    expect(text).toContain('diagnose --help');
    expect(text).not.toContain('DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT');
  });
});

describe('init CLI', () => {
  let cwd;

  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-init-'));
  });

  afterEach(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('installs via init and init-skill, and reports JSON status', () => {
    const first = runInit(cwd, ['init']);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('Skill current');
    expect(fs.readFileSync(skillPath(cwd), 'utf8')).toBe(loadCanonicalSkill().text);

    const check = runInit(cwd, ['init', '--check', '--json']);
    expect(check.status).toBe(0);
    const payload = JSON.parse(check.stdout);
    expect(jsonKeys(payload)).toBe(true);
    expect(payload).toMatchObject({ status: 'current', installedVersion: '1', exitCode: 0 });

    const alias = runInit(cwd, ['init-skill', '--check', '--json']);
    expect(alias.status).toBe(0);
    expect(JSON.parse(alias.stdout).status).toBe('current');
  });

  it('reports missing, outdated, modified, and invalid statuses', () => {
    const missing = runInit(cwd, ['init', '--check', '--json']);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({ status: 'missing', exitCode: 1 });

    fs.mkdirSync(path.dirname(skillPath(cwd)), { recursive: true });
    fs.writeFileSync(skillPath(cwd), fs.readFileSync(LEGACY_PATH));
    const outdated = runInit(cwd, ['init', '--check', '--json']);
    expect(outdated.status).toBe(1);
    expect(JSON.parse(outdated.stdout)).toMatchObject({ status: 'outdated', exitCode: 1 });

    fs.writeFileSync(skillPath(cwd), fs.readFileSync(MODIFIED_PATH));
    const modified = runInit(cwd, ['init', '--check', '--json']);
    expect(modified.status).toBe(1);
    expect(JSON.parse(modified.stdout)).toMatchObject({ status: 'modified', exitCode: 1 });

    fs.writeFileSync(skillPath(cwd), 'not a skill');
    const invalid = runInit(cwd, ['init', '--check', '--json']);
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ status: 'invalid', exitCode: 2 });
  });

  it('updates a modified Skill into .bak.1 and migrates AGENTS.md', async () => {
    fs.mkdirSync(path.dirname(skillPath(cwd)), { recursive: true });
    fs.writeFileSync(skillPath(cwd), fs.readFileSync(MODIFIED_PATH));
    fs.writeFileSync(`${skillPath(cwd)}.bak`, 'old-backup');
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), [
      'Keep this unrelated paragraph.',
      '',
      '## React Native Debug Toolkit',
      '',
      AGENT_DIRECTIVE,
      '',
      'Trailing notes stay.',
      '',
    ].join('\n'));

    const update = runInit(cwd, ['init', '--update']);
    expect(update.status).toBe(0);
    expect(fs.readFileSync(skillPath(cwd), 'utf8')).toBe(loadCanonicalSkill().text);
    expect(fs.readFileSync(`${skillPath(cwd)}.bak`, 'utf8')).toBe('old-backup');
    expect(fs.readFileSync(`${skillPath(cwd)}.bak.1`)).toEqual(fs.readFileSync(MODIFIED_PATH));

    const agents = fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Keep this unrelated paragraph.');
    expect(agents).toContain('Trailing notes stay.');
    expect(agents).toContain(AGENT_START);
    expect(agents).toContain(AGENT_END);
    expect(agents).toContain(AGENT_DIRECTIVE);
    expect((agents.match(new RegExp(AGENT_DIRECTIVE, 'g')) || []).length).toBe(1);

    const second = runInit(cwd, ['init']);
    expect(second.status).toBe(0);
    expect(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8')).toBe(agents);
  });
});

describe('init refuses hostile paths', () => {
  it('does not follow Skill, AGENTS, directory, or backup symlinks', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-init-safe-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-init-out-'));
    const sentinel = path.join(outside, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'SECRET');

    try {
      fs.mkdirSync(path.join(cwd, '.agents/skills/react-native-debug-toolkit'), { recursive: true });
      fs.symlinkSync(sentinel, skillPath(cwd));
      const skillLink = await initSkillCommand({ targetDir: cwd, check: true });
      expect(skillLink).toMatchObject({ status: 'invalid', exitCode: 2 });
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('SECRET');

      fs.rmSync(skillPath(cwd));
      fs.writeFileSync(skillPath(cwd), loadCanonicalSkill().text);
      fs.rmSync(path.join(cwd, 'AGENTS.md'), { force: true });
      fs.symlinkSync(sentinel, path.join(cwd, 'AGENTS.md'));
      const agentsLink = await initSkillCommand({ targetDir: cwd });
      expect(agentsLink.status).toBe('invalid');
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('SECRET');

      fs.rmSync(path.join(cwd, 'AGENTS.md'));
      fs.rmSync(path.join(cwd, '.agents'), { recursive: true, force: true });
      fs.symlinkSync(outside, path.join(cwd, '.agents'));
      const dirLink = await initSkillCommand({ targetDir: cwd });
      expect(dirLink.status).toBe('invalid');
      expect(fs.existsSync(path.join(outside, 'skills'))).toBe(false);

      fs.rmSync(path.join(cwd, '.agents'));
      fs.mkdirSync(path.join(cwd, '.agents/skills/react-native-debug-toolkit'), { recursive: true });
      fs.writeFileSync(skillPath(cwd), fs.readFileSync(MODIFIED_PATH));
      fs.symlinkSync(sentinel, `${skillPath(cwd)}.bak`);
      const update = await initSkillCommand({ targetDir: cwd, update: true });
      expect(update.status).toBe('current');
      expect(fs.lstatSync(`${skillPath(cwd)}.bak`).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('SECRET');
      expect(fs.existsSync(`${skillPath(cwd)}.bak.1`)).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
