import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rename, rm, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {verifyPackage} from '../verify-package.mjs';
import {assertOutsideRepository, createConsumer} from '../consumer-fixture.mjs';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
async function archive(t, change = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toolkit-package-test-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const entry = name => ({types: `./lib/typescript/src/${name}.d.ts`, 'react-native': `./src/${name}.ts`, import: `./lib/module/${name}.js`, require: `./lib/commonjs/${name}.js`, default: `./lib/commonjs/${name}.js`});
  const manifest = {name: 'react-native-debug-toolkit', version: '5.0.0', main: 'lib/commonjs/index.js', module: 'lib/module/index.js', types: 'lib/typescript/src/index.d.ts', 'react-native': 'src/index.ts', exports: {'.': entry('index'), './adapters/zustand': entry('adapters/zustand'), './metro': {types: './metro.d.ts', default: './node/metro/index.js'}, './package.json': './package.json'}, dependencies: {'react-native-mmkv': '4.3.2'}, peerDependencies: {react: '>=18', 'react-native': '>=0.76.6 <=0.85.1', 'react-native-nitro-modules': '0.35.10'}};
  const files = Object.fromEntries(['README.md', 'README-zh-CN.md', 'docs/integration.md', 'docs/integration.zh-CN.md', 'docs/configuration.md', 'docs/configuration.zh-CN.md', 'docs/examples/integration/App.tsx', 'react-native-debug-toolkit.podspec', 'android/build.gradle', 'android/src/main/java/Test.java', 'ios/Test.mm', 'node/metro/index.js', 'node/metro/activation.js', 'src/utils/hubActivation.ts', 'src/utils/defaultHubActivation.ts'].map(f => [f, 'fixture']));
  files['metro.d.ts'] = await readFile(new URL('../../metro.d.ts', import.meta.url), 'utf8');
  for (const name of ['index', 'adapters/zustand']) for (const target of Object.values(entry(name))) files[target.slice(2)] = 'export {};';
  change({files, manifest});
  files['package.json'] = JSON.stringify(manifest);
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, 'package', file)), {recursive: true});
    await writeFile(path.join(dir, 'package', file), content);
  }
  const tarball = path.join(dir, 'fixture.tgz');
  await run('tar', ['-czf', tarball, '-C', dir, 'package']);
  return tarball;
}

test('accepts complete public and native package entries', async t => {
  assert.equal((await verifyPackage(await archive(t))).name, 'react-native-debug-toolkit');
});
for (const file of ['lib/typescript/src/index.d.ts', 'android/build.gradle', 'ios/Test.mm', 'README-zh-CN.md', 'docs/configuration.md', 'docs/examples/integration/App.tsx', 'node/metro/index.js', 'metro.d.ts', 'node/metro/activation.js']) {
  test(`rejects missing ${file}`, async t => {
    await assert.rejects(verifyPackage(await archive(t, ({files}) => {delete files[file];})), /missing/i);
  });
}
test('Metro types resolve by package name with legacy Node resolution', async t => {
  const consumer = await mkdtemp(path.join(os.tmpdir(), 'toolkit-metro-types-'));
  t.after(() => rm(consumer, {recursive: true, force: true}));
  const modules = path.join(consumer, 'node_modules');
  await mkdir(modules);
  await run('tar', ['-xzf', await archive(t), '-C', modules]);
  await rename(path.join(modules, 'package'), path.join(modules, 'react-native-debug-toolkit'));
  const source = path.join(consumer, 'metro.ts');
  await writeFile(source, "import { withDebugToolkitMetro } from 'react-native-debug-toolkit/metro';\nwithDebugToolkitMetro({ resolver: {} }, { projectRoot: '/app' });\n");
  await run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--moduleResolution', 'node', source], {cwd: consumer});
});
test('rejects optional store import in transitive main graph', async t => {
  const tarball = await archive(t, ({files}) => {
    files['lib/commonjs/index.js'] = "require('./internal');";
    files['lib/commonjs/internal.js'] = "require('zustand');";
  });
  await assert.rejects(verifyPackage(tarball), /optional.*zustand/i);
});
test('rejects internal exports and repository-only files', async t => {
  await assert.rejects(verifyPackage(await archive(t, ({manifest}) => {manifest.exports['./core/*'] = './src/core/*';})), /exports/i);
  await assert.rejects(verifyPackage(await archive(t, ({files}) => {files['docs/superpowers/specs/private.md'] = 'private';})), /private|internal/i);
});
test('rejects local external dependencies', async t => {
  await assert.rejects(verifyPackage(await archive(t, ({manifest}) => {manifest.dependencies.bad = 'file:../bad';})), /external|local/i);
});
test('fixture must not be in repository', async () => {
  assert.throws(() => assertOutsideRepository('/tmp/repo', '/tmp/repo/consumer'), /outside/);
  assert.throws(() => assertOutsideRepository('/tmp/repo', '/tmp/repo'), /outside/);
  assert.doesNotThrow(() => assertOutsideRepository('/tmp/repo', '/tmp/repo-consumer'));
});
test('fixture refuses existing directories and symlinks into the repository', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toolkit-consumer-test-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  await assert.rejects(createConsumer({out: dir, tarball: '/missing.tgz', mode: 'blank'}), /already exists/);
  await symlink(process.cwd(), path.join(dir, 'repo'));
  await assert.rejects(createConsumer({out: path.join(dir, 'repo', 'consumer-test-output'), tarball: '/missing.tgz', mode: 'integrated'}), /outside/);
});
