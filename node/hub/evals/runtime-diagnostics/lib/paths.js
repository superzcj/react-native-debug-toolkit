'use strict';

const path = require('path');

const EVAL_ROOT = path.join(__dirname, '..');
const CHECKOUT_ROOT = path.join(EVAL_ROOT, '../../../..');
const BIN_PATH = path.join(CHECKOUT_ROOT, 'bin/debug-toolkit.js');
const CANONICAL_SKILL = path.join(CHECKOUT_ROOT, 'node/hub/skills/react-native-debug-toolkit/SKILL.md');
const LEGACY_SKILL = path.join(EVAL_ROOT, 'baselines/legacy-SKILL.md');

module.exports = {
  EVAL_ROOT,
  CHECKOUT_ROOT,
  BIN_PATH,
  CANONICAL_SKILL,
  LEGACY_SKILL,
};
