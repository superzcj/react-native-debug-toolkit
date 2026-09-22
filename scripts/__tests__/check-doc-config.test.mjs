import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {configurationContract, checkConfigurationDocument} from '../check-doc-config.mjs';

const source = await readFile(new URL('../../src/core/config.ts', import.meta.url), 'utf8');
const contract = configurationContract(source);
const complete = [...contract].map(([field, value]) => `| \`${field}\` | \`${value}\` | Description |`).join('\n');

test('derives defaults and all feature fields from the parser definitions', () => {
  assert.equal(contract.get('network.maxLogs'), '200');
  assert.equal(contract.get('accounts.source'), 'undefined');
  assert.equal(contract.get('clipboard.enabled'), 'true');
  assert.deepEqual(checkConfigurationDocument(complete, contract), []);
});
test('rejects omitted fields, changed defaults, duplicates and invented fields', () => {
  assert.match(checkConfigurationDocument(complete.replace(/^.*network.maxLogs.*\n/m, ''), contract).join('\n'), /Missing network.maxLogs/);
  assert.match(checkConfigurationDocument(complete.replace('`200`', '`100`'), contract).join('\n'), /default/);
  assert.match(checkConfigurationDocument(`${complete}\n| \`clipboard.enabled\` | \`true\` | duplicate |`, contract).join('\n'), /Duplicate/);
  assert.match(checkConfigurationDocument(`${complete}\n| \`network.blacklist\` | \`[]\` | old |`, contract).join('\n'), /Unknown/);
});
test('new parser fields and defaults require matching documentation', () => {
  const next = configurationContract(source.replace("console: ['maxLogs']", "console: ['maxLogs', 'future']").replace('console: { maxLogs: 200 }', 'console: { maxLogs: 300, future: false }'));
  const errors = checkConfigurationDocument(complete, next).join('\n');
  assert.match(errors, /console.maxLogs default/);
  assert.match(errors, /Missing console.future/);
});
test('both published configuration references satisfy the same contract', async () => {
  for (const name of ['configuration.md', 'configuration.zh-CN.md']) {
    assert.deepEqual(checkConfigurationDocument(await readFile(new URL(`../../docs/${name}`, import.meta.url), 'utf8'), contract), [], name);
  }
});
