'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = '.agents/skills/react-native-debug-toolkit';
const SKILL_REL = `${SKILL_DIR}/SKILL.md`;
const AGENTS_REL = 'AGENTS.md';
const CANONICAL_PATH = path.join(__dirname, '../../../skills/react-native-debug-toolkit/SKILL.md');

const AGENT_START = '<!-- react-native-debug-toolkit:start -->';
const AGENT_END = '<!-- react-native-debug-toolkit:end -->';
const AGENT_DIRECTIVE = 'For React Native runtime problems or log requests, read .agents/skills/react-native-debug-toolkit/SKILL.md and follow it.';
const LEGACY_HEADING = '## React Native Debug Toolkit';

const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_RDONLY = fs.constants.O_RDONLY;
const O_WRONLY = fs.constants.O_WRONLY;
const O_CREAT = fs.constants.O_CREAT;
const O_EXCL = fs.constants.O_EXCL;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function resultShape(fields) {
  return {
    status: fields.status,
    installedVersion: fields.installedVersion == null ? null : String(fields.installedVersion),
    availableVersion: fields.availableVersion == null ? null : String(fields.availableVersion),
    skillPath: fields.skillPath,
    suggestedCommand: fields.suggestedCommand == null ? null : fields.suggestedCommand,
    exitCode: fields.exitCode,
    warnings: Array.isArray(fields.warnings) ? fields.warnings : [],
  };
}

function parseSkillSource(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, message: 'Skill is empty' };
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { ok: false, message: 'Skill frontmatter is missing' };
  }
  const front = match[1];
  const body = match[2];
  const name = front.match(/^name:\s*(.+)\s*$/m);
  const description = front.match(/^description:\s*(.+)\s*$/m);
  const htmlMarkers = [...body.matchAll(/<!--\s*skill-template-version:\s*([^\s]+)\s*-->/g)];
  const yamlVersion = front.match(/^skillTemplateVersion:\s*(.+)\s*$/m);
  let version = null;
  if (htmlMarkers.length === 1) {
    version = htmlMarkers[0][1];
  } else if (htmlMarkers.length > 1) {
    return { ok: false, message: 'Skill has multiple version markers' };
  } else if (yamlVersion) {
    version = yamlVersion[1].trim();
  }
  if (!version) {
    return { ok: false, message: 'Skill version marker is missing' };
  }
  if (htmlMarkers.length === 1 && (!name || !description || !name[1].trim() || !description[1].trim())) {
    return { ok: false, message: 'Skill name and description are required' };
  }
  return {
    ok: true,
    version,
    name: name ? name[1].trim() : null,
    description: description ? description[1].trim() : null,
    text,
  };
}

function loadCanonicalSkill() {
  const buf = fs.readFileSync(CANONICAL_PATH);
  const text = buf.toString('utf8');
  const parsed = parseSkillSource(text);
  if (!parsed.ok || !parsed.name || !parsed.description) {
    throw new Error(parsed.message || 'canonical Skill is invalid');
  }
  return {
    text,
    buffer: buf,
    version: parsed.version,
    name: parsed.name,
    description: parsed.description,
    sha256: sha256(buf),
  };
}

function isContained(root, candidate) {
  const rootParts = path.resolve(root).split(path.sep);
  const candParts = path.resolve(candidate).split(path.sep);
  if (candParts.length < rootParts.length) {
    return false;
  }
  for (let i = 0; i < rootParts.length; i += 1) {
    if (rootParts[i] !== candParts[i]) {
      return false;
    }
  }
  return true;
}

function inspectManagedPath(root, relativePath) {
  const abs = path.resolve(root, relativePath);
  if (!isContained(root, abs)) {
    return { ok: false, code: 'invalid', message: 'path escapes target root' };
  }
  const parts = relativePath.split(/[/\\]/).filter(Boolean);
  let current = root;
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    let st;
    try {
      st = fs.lstatSync(current);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return { ok: true, exists: false, abs, missingAt: i };
      }
      return { ok: false, code: 'invalid', message: err.message };
    }
    const last = i === parts.length - 1;
    if (st.isSymbolicLink()) {
      return { ok: false, code: 'invalid', message: `${relativePath} is a symlink` };
    }
    if (last) {
      if (!st.isFile()) {
        return { ok: false, code: 'invalid', message: `${relativePath} is not a regular file` };
      }
      return { ok: true, exists: true, abs, stat: st };
    }
    if (!st.isDirectory()) {
      return { ok: false, code: 'invalid', message: `${relativePath} parent is not a directory` };
    }
  }
  return { ok: true, exists: false, abs };
}

function readRegularFile(abs) {
  const fd = fs.openSync(abs, O_RDONLY | NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      const err = new Error('not a regular file');
      err.code = 'invalid';
      throw err;
    }
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function writeExclusiveFile(abs, content) {
  const dir = path.dirname(abs);
  const tmp = path.join(dir, `.debug-toolkit-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  const fd = fs.openSync(tmp, O_CREAT | O_EXCL | O_WRONLY | NOFOLLOW, 0o644);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) {
      const err = new Error('temporary path is not a regular file');
      err.code = 'invalid';
      throw err;
    }
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, abs);
}

function chooseBackupPath(skillPath) {
  const candidates = [`${skillPath}.bak`];
  for (let i = 1; i < 1000; i += 1) {
    candidates.push(`${skillPath}.bak.${i}`);
  }
  for (const candidate of candidates) {
    try {
      fs.lstatSync(candidate);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return candidate;
      }
      throw err;
    }
  }
  const err = new Error('no unused backup name');
  err.code = 'invalid';
  throw err;
}

function ensureSafeDirs(root, relativeDir) {
  const parts = relativeDir.split(/[/\\]/).filter(Boolean);
  let currentRel = '';
  for (const part of parts) {
    currentRel = currentRel ? `${currentRel}/${part}` : part;
    const abs = path.resolve(root, currentRel);
    if (!isContained(root, abs)) {
      const err = new Error('directory escapes target root');
      err.code = 'invalid';
      throw err;
    }
    try {
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) {
        const err = new Error(`${currentRel} is a symlink`);
        err.code = 'invalid';
        throw err;
      }
      if (!st.isDirectory()) {
        const err = new Error(`${currentRel} is not a directory`);
        err.code = 'invalid';
        throw err;
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        fs.mkdirSync(abs);
        continue;
      }
      throw err;
    }
  }
}

function gitIgnored(targetDir, relativePath) {
  try {
    const result = spawnSync('git', ['check-ignore', '--quiet', '--', relativePath], {
      cwd: targetDir,
      encoding: 'utf8',
    });
    return result.status === 0;
  } catch (_err) {
    return false;
  }
}

function findIgnoredGeneratedFiles(targetDir) {
  const warnings = [];
  if (gitIgnored(targetDir, SKILL_REL)) {
    warnings.push(`${SKILL_REL} is ignored by git`);
  }
  if (gitIgnored(targetDir, AGENTS_REL)) {
    warnings.push(`${AGENTS_REL} is ignored by git`);
  }
  return warnings;
}

function managedAgentsSection() {
  return `${AGENT_START}\n${LEGACY_HEADING}\n\n${AGENT_DIRECTIVE}\n${AGENT_END}\n`;
}

function rewriteAgentsContent(existing) {
  const section = managedAgentsSection();
  if (existing.includes(AGENT_START) && existing.includes(AGENT_END)) {
    const start = existing.indexOf(AGENT_START);
    const end = existing.indexOf(AGENT_END);
    if (end < start) {
      return existing.endsWith('\n') ? `${existing}\n${section}` : `${existing}\n\n${section}`;
    }
    const after = end + AGENT_END.length;
    const prefix = existing.slice(0, start);
    let suffix = existing.slice(after);
    if (suffix.startsWith('\n')) {
      suffix = suffix.slice(1);
    }
    return `${prefix}${section}${suffix}`;
  }
  const legacyBlock = `${LEGACY_HEADING}\n\n${AGENT_DIRECTIVE}\n`;
  const idx = existing.indexOf(legacyBlock);
  if (idx >= 0) {
    return `${existing.slice(0, idx)}${section}${existing.slice(idx + legacyBlock.length)}`;
  }
  if (existing.includes(AGENT_DIRECTIVE)) {
    return existing.replace(AGENT_DIRECTIVE, `${AGENT_START}\n${AGENT_DIRECTIVE}\n${AGENT_END}`);
  }
  if (!existing) {
    return section;
  }
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${section}`;
}

function resolveTargetRoot(targetDir) {
  try {
    const st = fs.lstatSync(targetDir);
    if (!st.isDirectory() && !st.isSymbolicLink()) {
      const err = new Error('target is not a directory');
      err.code = 'invalid';
      throw err;
    }
    const real = fs.realpathSync(targetDir);
    const realSt = fs.lstatSync(real);
    if (!realSt.isDirectory()) {
      const err = new Error('target is not a directory');
      err.code = 'invalid';
      throw err;
    }
    return real;
  } catch (err) {
    if (err && err.code === 'invalid') {
      throw err;
    }
    const wrapped = new Error(err.message || 'target is unreadable');
    wrapped.code = 'invalid';
    throw wrapped;
  }
}

function inspectInstalledSkill(targetDir) {
  const canonical = loadCanonicalSkill();
  let root;
  try {
    root = resolveTargetRoot(targetDir);
  } catch (err) {
    return resultShape({
      status: 'invalid',
      installedVersion: null,
      availableVersion: canonical.version,
      skillPath: path.resolve(targetDir, SKILL_REL),
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 2,
      warnings: [],
    });
  }
  const inspected = inspectManagedPath(root, SKILL_REL);
  const skillPath = inspected.abs || path.join(root, SKILL_REL);
  const warnings = findIgnoredGeneratedFiles(root);
  if (!inspected.ok) {
    return resultShape({
      status: 'invalid',
      installedVersion: null,
      availableVersion: canonical.version,
      skillPath,
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 2,
      warnings,
    });
  }
  if (!inspected.exists) {
    return resultShape({
      status: 'missing',
      installedVersion: null,
      availableVersion: canonical.version,
      skillPath,
      suggestedCommand: 'debug-toolkit init',
      exitCode: 1,
      warnings,
    });
  }
  let buf;
  try {
    buf = readRegularFile(inspected.abs);
  } catch (_err) {
    return resultShape({
      status: 'invalid',
      installedVersion: null,
      availableVersion: canonical.version,
      skillPath,
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 2,
      warnings,
    });
  }
  const parsed = parseSkillSource(buf.toString('utf8'));
  if (!parsed.ok) {
    return resultShape({
      status: 'invalid',
      installedVersion: null,
      availableVersion: canonical.version,
      skillPath,
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 2,
      warnings,
    });
  }
  if (parsed.version !== canonical.version) {
    return resultShape({
      status: 'outdated',
      installedVersion: parsed.version,
      availableVersion: canonical.version,
      skillPath,
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 1,
      warnings,
    });
  }
  if (sha256(buf) !== canonical.sha256) {
    return resultShape({
      status: 'modified',
      installedVersion: parsed.version,
      availableVersion: canonical.version,
      skillPath,
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 1,
      warnings,
    });
  }
  return resultShape({
    status: 'current',
    installedVersion: parsed.version,
    availableVersion: canonical.version,
    skillPath,
    suggestedCommand: 'debug-toolkit init --check',
    exitCode: 0,
    warnings,
  });
}

function backupExistingSkill(skillPath, previous) {
  const backupPath = chooseBackupPath(skillPath);
  writeExclusiveFile(backupPath, previous);
  return backupPath;
}

function writeCanonicalSkill(root, canonical, previousBuffer) {
  ensureSafeDirs(root, SKILL_DIR);
  const skillPath = path.join(root, SKILL_REL);
  const existing = inspectManagedPath(root, SKILL_REL);
  if (!existing.ok) {
    const err = new Error(existing.message);
    err.code = 'invalid';
    throw err;
  }
  if (existing.exists && previousBuffer && sha256(previousBuffer) !== canonical.sha256) {
    backupExistingSkill(skillPath, previousBuffer);
  }
  writeExclusiveFile(skillPath, canonical.buffer);
  return skillPath;
}

function ensureAgentInstructions(targetDir) {
  const root = resolveTargetRoot(targetDir);
  const inspected = inspectManagedPath(root, AGENTS_REL);
  if (!inspected.ok && inspected.message && inspected.message.includes('symlink')) {
    const err = new Error(inspected.message);
    err.code = 'invalid';
    throw err;
  }
  if (!inspected.ok && inspected.exists) {
    const err = new Error(inspected.message || 'AGENTS.md is invalid');
    err.code = 'invalid';
    throw err;
  }
  let existing = '';
  if (inspected.ok && inspected.exists) {
    existing = readRegularFile(inspected.abs).toString('utf8');
  }
  const next = rewriteAgentsContent(existing);
  if (next === existing) {
    return false;
  }
  writeExclusiveFile(path.join(root, AGENTS_REL), Buffer.from(next, 'utf8'));
  return true;
}

async function initSkillCommand(options = {}) {
  const targetDir = options.targetDir || process.cwd();
  const check = Boolean(options.check);
  const update = Boolean(options.update);
  const canonical = loadCanonicalSkill();

  const inspected = inspectInstalledSkill(targetDir);
  if (check) {
    return inspected;
  }

  if (inspected.status === 'invalid') {
    return inspected;
  }

  if (inspected.status === 'current' && !update) {
    try {
      ensureAgentInstructions(targetDir);
    } catch (err) {
      if (err && err.code === 'invalid') {
        return resultShape({ ...inspected, status: 'invalid', exitCode: 2 });
      }
      throw err;
    }
    return inspectInstalledSkill(targetDir);
  }

  if ((inspected.status === 'modified' || inspected.status === 'outdated') && !update) {
    return inspected;
  }

  try {
    const root = resolveTargetRoot(targetDir);
    let previous = null;
    if (inspected.status === 'modified' || inspected.status === 'outdated' || inspected.status === 'current') {
      const skill = inspectManagedPath(root, SKILL_REL);
      if (skill.ok && skill.exists) {
        previous = readRegularFile(skill.abs);
      }
    }
    writeCanonicalSkill(root, canonical, previous);
    ensureAgentInstructions(targetDir);
    const next = inspectInstalledSkill(targetDir);
    return resultShape({ ...next, warnings: findIgnoredGeneratedFiles(root) });
  } catch (err) {
    return resultShape({
      status: 'invalid',
      installedVersion: inspected.installedVersion,
      availableVersion: canonical.version,
      skillPath: inspected.skillPath,
      suggestedCommand: 'debug-toolkit init --update',
      exitCode: 2,
      warnings: inspected.warnings,
    });
  }
}

module.exports = {
  SKILL_REL,
  AGENT_START,
  AGENT_END,
  AGENT_DIRECTIVE,
  loadCanonicalSkill,
  inspectInstalledSkill,
  ensureAgentInstructions,
  findIgnoredGeneratedFiles,
  initSkillCommand,
};
