'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AGENT_START, AGENT_END, AGENT_DIRECTIVE } = require('../../../src/cli/commands/initSkill');
const { CANONICAL_SKILL, LEGACY_SKILL, CHECKOUT_ROOT } = require('./paths');

function managedAgentsSection() {
  return `${AGENT_START}\nRuntime Diagnostics Skill\n\n${AGENT_DIRECTIVE}\n${AGENT_END}\n`;
}

function createEvalWorkspace(options = {}) {
  const {
    skillSource = 'canonical',
    bridge = true,
    parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-workspace-')),
  } = options;

  const workspace = path.join(parentDir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });

  const skillDestDir = path.join(workspace, '.agents/skills/react-native-debug-toolkit');
  fs.mkdirSync(skillDestDir, { recursive: true });
  const sourcePath = skillSource === 'legacy' ? LEGACY_SKILL : CANONICAL_SKILL;
  fs.copyFileSync(sourcePath, path.join(skillDestDir, 'SKILL.md'));

  if (bridge) {
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), managedAgentsSection(), 'utf8');
  }

  const homeDir = path.join(parentDir, 'home');
  const codexHome = path.join(parentDir, 'codex-home');
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });

  const packageLink = path.join(workspace, 'node_modules');
  fs.mkdirSync(packageLink, { recursive: true });
  fs.symlinkSync(CHECKOUT_ROOT, path.join(packageLink, 'react-native-debug-toolkit'), 'dir');

  return {
    workspace,
    parentDir,
    homeDir,
    codexHome,
    skillPath: path.join(skillDestDir, 'SKILL.md'),
    configurationSource: skillSource === 'legacy' ? 'legacy-baseline' : 'canonical',
  };
}

function sanitizeEnv(env = {}) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value != null && value !== ''));
}

function buildAllowlistedEnv(workspaceInfo, fixture, extra = {}) {
  const local = fixture.localEndpoint || fixture.endpoints?.[0] || null;
  const project = fixture.projectEndpoint || null;
  const env = {
    PATH: process.env.PATH,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    TMPDIR: process.env.TMPDIR || os.tmpdir(),
    HOME: workspaceInfo.homeDir,
    CODEX_HOME: workspaceInfo.codexHome,
  };
  if (local) env.DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT = local;
  if (project) env.DEBUG_TOOLKIT_HUB_ENDPOINT = project;
  if (fixture.localDataDir) env.DEBUG_TOOLKIT_EVAL_HUB_DATA_DIR = fixture.localDataDir;
  return sanitizeEnv({ ...env, ...extra });
}

module.exports = {
  createEvalWorkspace,
  buildAllowlistedEnv,
  managedAgentsSection,
};
