import {mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run = promisify(execFile);

export async function verifyPackage(tarball) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'toolkit-verify-'));
  try {
    const {stdout: listing} = await run('tar', ['-tzf', path.resolve(tarball)]);
    const paths = listing.trim().split('\n').filter(Boolean);
    if (paths.some(p => !p.startsWith('package/') || p.split('/').includes('..'))) throw new Error('unsafe archive path');
    const {stdout: detail} = await run('tar', ['-tvzf', path.resolve(tarball)]);
    if (detail.split('\n').some(p => /^[lh]/.test(p))) throw new Error('archive links are not allowed');
    await run('tar', ['-xzf', path.resolve(tarball), '-C', temp]);
    const root = path.join(temp, 'package');
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const exists = async p => {
      if (typeof p !== 'string' || path.isAbsolute(p) || p.split('/').includes('..')) throw new Error(`invalid package path: ${p}`);
      try { if ((await stat(path.join(root, p))).isFile()) return; } catch {}
      throw new Error(`missing package file: ${p}`);
    };
    if (JSON.stringify(Object.keys(manifest.exports || {}).sort()) !== JSON.stringify(['.', './adapters/zustand', './package.json'].sort())) throw new Error('exports must contain only the public API');
    for (const key of ['.', './adapters/zustand']) {
      const entry = manifest.exports[key];
      for (const condition of ['types', 'react-native', 'import', 'require', 'default']) await exists(entry?.[condition]);
    }
    await exists(manifest.exports['./package.json']);
    for (const key of ['main', 'module', 'types', 'react-native']) await exists(manifest[key]);
    for (const p of ['README.md', 'README-zh-CN.md', 'docs/integration.md', 'docs/integration.zh-CN.md', 'docs/configuration.md', 'docs/configuration.zh-CN.md', 'docs/examples/integration/App.tsx', 'react-native-debug-toolkit.podspec', 'android/build.gradle']) await exists(p);
    for (const prefix of ['package/ios/', 'package/android/src/']) {
      if (!paths.some(p => p.startsWith(prefix) && /\.(mm?|swift|java|kt)$/.test(p))) throw new Error(`missing native sources: ${prefix}`);
    }
    if (paths.some(p => /\/(?:__tests__|__fixtures__|__mocks__|node_modules|\.gradle)\//.test(p) || /^package\/docs\/(?:blog|plans|superpowers)\//.test(p))) throw new Error('private/internal files leaked into package');
    for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, version] of Object.entries(manifest[group] || {})) {
        if (/^(?:file:|link:|workspace:|\/|\.\.)/.test(version)) throw new Error(`local external dependency: ${name}`);
      }
    }
    // Check the complete main-entry source/build graphs, including indirect imports.
    const visited = new Set();
    async function visit(file) {
      if (visited.has(file)) return;
      visited.add(file);
      const source = await readFile(file, 'utf8');
      const imports = [...source.matchAll(/(?:\b(?:from|import)\s*|\b(?:require|import)\s*\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
      for (const specifier of imports) {
        if (/^(zustand|redux|@reduxjs\/toolkit|mobx|recoil|jotai)(\/|$)/.test(specifier) || /adapters\/zustand/.test(specifier)) throw new Error(`optional state dependency in main graph: ${specifier}`);
        if (!specifier.startsWith('.')) continue;
        const base = path.resolve(path.dirname(file), specifier);
        if (!base.startsWith(root + path.sep)) throw new Error(`external import: ${specifier}`);
        for (const candidate of [base, ...['.ts', '.tsx', '.js', '/index.ts', '/index.tsx', '/index.js'].map(ext => base + ext)]) {
          try { if (!(await stat(candidate)).isFile()) continue; } catch {continue;}
          if (/\.[jt]sx?$/.test(candidate)) await visit(candidate);
          break;
        }
      }
    }
    for (const entry of ['main', 'module', 'react-native']) await visit(path.join(root, manifest[entry]));
    return {name: manifest.name, version: manifest.version, files: paths.length, exports: manifest.exports};
  } finally {await rm(temp, {recursive: true, force: true});}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--tarball') {
    console.error('Usage: node scripts/verify-package.mjs --tarball <absolute.tgz>'); process.exitCode = 1;
  } else {
    try {console.log(JSON.stringify(await verifyPackage(args[1]), null, 2));}
    catch (error) {console.error(error.message); process.exitCode = 1;}
  }
}
