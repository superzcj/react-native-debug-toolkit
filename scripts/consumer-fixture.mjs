import {cp, mkdir, readFile, writeFile, realpath, lstat, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function assertOutsideRepository(repo, output) {
  const relative = path.relative(path.resolve(repo), path.resolve(output));
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('consumer fixture must be outside the repository');
}
async function canonicalOutput(output) {
  try {await lstat(output); throw new Error('output already exists; refusing to overwrite');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  // Require an existing parent: realpath prevents symlink aliases into the repo.
  return path.join(await realpath(path.dirname(output)), path.basename(output));
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const env = {...process.env}; delete env.NODE_PATH;
    const child = spawn(command, args, {cwd, env, stdio: 'inherit', shell: false});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}
export async function createConsumer({tarball, out, mode}) {
  if (!['blank', 'integrated'].includes(mode)) throw new Error('mode must be blank or integrated');
  if (!path.isAbsolute(out) || !path.isAbsolute(tarball)) throw new Error('tarball and out must be absolute paths');
  const output = await canonicalOutput(out);
  assertOutsideRepository(await realpath(repository), output);
  const archive = await realpath(tarball);
  if (!(await lstat(archive)).isFile()) throw new Error('tarball must be a file');
  const demo = path.join(repository, 'Demo');
  await mkdir(output);
  const excluded = new Set(['node_modules', 'Pods', 'build', 'Build', 'DerivedData', '.gradle', '.cxx', '.bundle', '.cache', '.DS_Store', 'xcuserdata', 'local.properties', '.xcode.env', '.xcode.env.local', 'Podfile.lock']);
  for (const name of ['android', 'ios', 'app.json', 'babel.config.js', 'metro.config.js', 'react-native.config.js', 'tsconfig.json', 'jest.config.js', 'Gemfile', 'Gemfile.lock', 'package-lock.json']) {
    await cp(path.join(demo, name), path.join(output, name), {recursive: true, filter: async source => !excluded.has(path.basename(source)) && !(await lstat(source)).isSymbolicLink()});
  }
  const manifest = JSON.parse(await readFile(path.join(demo, 'package.json'), 'utf8'));
  manifest.scripts = {android: 'react-native run-android', ios: 'react-native run-ios', start: 'react-native start', test: 'jest --runInBand', typecheck: 'tsc --noEmit -p tsconfig.json'};
  // Copy the archive into the fixture: even its lockfile is independent of the repo.
  await cp(archive, path.join(output, 'toolkit.tgz'));
  manifest.dependencies['react-native-debug-toolkit'] = 'file:./toolkit.tgz';
  for (const group of ['dependencies', 'devDependencies']) for (const [name, version] of Object.entries(manifest[group] || {})) {
    if (name !== 'react-native-debug-toolkit' && /^(file:|link:|workspace:|\/|\.\.)/.test(version)) throw new Error(`external dependency: ${name}`);
  }
  await writeFile(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const app = `import React from 'react';\nimport {Text, View} from 'react-native';\n${mode === 'integrated' ? "import {withDebugToolkit} from 'react-native-debug-toolkit';\n" : ''}\nfunction App() {\n  return <View><Text>Consumer app</Text></View>;\n}\n\nexport default ${mode === 'integrated' ? 'withDebugToolkit(App)' : 'App'};\n`;
  await writeFile(path.join(output, 'App.tsx'), app);
  await writeFile(path.join(output, 'index.js'), "import {AppRegistry} from 'react-native';\nimport App from './App';\nimport {name as appName} from './app.json';\nAppRegistry.registerComponent(appName, () => App);\n");
  await mkdir(path.join(output, '__tests__'));
  for (const name of ['react-native.mock.js', 'safe-area-context.mock.js']) await cp(path.join(demo, '__tests__', name), path.join(output, '__tests__', name));
  await writeFile(path.join(output, '__tests__/App.test.tsx'), `import React from 'react';\nimport renderer, {act} from 'react-test-renderer';\nimport App from '../App';\n// Jest has no native JSI runtime; only the MMKV native boundary is replaced.\njest.mock('react-native-mmkv', () => ({createMMKV: () => ({getString: () => undefined, set: () => undefined, remove: () => true})}));\n(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;\ntest('renders the consumer root', async () => {\n  let tree: renderer.ReactTestRenderer;\n  await act(async () => {tree = renderer.create(<App />);});\n  expect(JSON.stringify(tree!.toJSON())).toContain('Consumer app');\n  await act(async () => {tree!.unmount();});\n});\n`);
  // Reject accidental absolute repository references in the copied native/config shell.
  async function check(dir) {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await check(p);
      else if (/\.(?:json|js|gradle|properties|pbxproj|xcworkspacedata)$/.test(p) || entry.name === 'Podfile') {
        const text = await readFile(p, 'utf8');
        if (text.includes(repository) || /\.\.\/\.\.\/(?:src|android|ios)/.test(text)) throw new Error(`repository reference in ${p}`);
      }
    }
  }
  // The incoming Demo npm lock contains its file:.. entry. npm regenerates it below.
  const lock = JSON.parse(await readFile(path.join(output, 'package-lock.json'), 'utf8'));
  delete lock.packages['..'];
  delete lock.packages['node_modules/react-native-debug-toolkit'];
  lock.packages[''].dependencies = manifest.dependencies;
  await writeFile(path.join(output, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  await check(output);
  await run('npm', ['install', '--no-audit', '--no-fund'], output);
  const env = {...process.env}; delete env.NODE_PATH;
  const {stdout} = await exec(process.execPath, ['node_modules/react-native/cli.js', 'config'], {cwd: output, env});
  const native = JSON.parse(stdout);
  for (const dependency of Object.values(native.dependencies)) {
    for (const location of [dependency.root, dependency.platforms.ios?.podspecPath, dependency.platforms.android?.sourceDir].filter(Boolean)) {
      if (!(await realpath(location)).startsWith(output + '/node_modules/')) throw new Error(`autolinking escapes consumer: ${location}`);
    }
  }
  for (const name of ['react-native-debug-toolkit', 'react-native-mmkv', 'react-native-nitro-modules']) {
    if (!native.dependencies[name]?.platforms.ios || !native.dependencies[name]?.platforms.android) throw new Error(`native dependency missing: ${name}`);
  }
  await writeFile(path.join(output, 'autolinking.json'), JSON.stringify(native, null, 2) + '\n');
  const evidence = {directory: output, mode, template: {reactNative: manifest.dependencies['react-native'], cli: manifest.devDependencies['@react-native-community/cli']}, manifest};
  await writeFile(path.join(output, 'consumer-manifest.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 6 || new Set(args.filter((_, i) => i % 2 === 0)).size !== 3) throw new Error('Usage: --tarball <absolute.tgz> --out <new absolute-dir> --mode blank|integrated');
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--tarball', '--out', '--mode'].includes(args[i])) throw new Error(`unknown option ${args[i]}`);
      options[args[i].slice(2)] = args[i + 1];
    }
    console.log(JSON.stringify(await createConsumer(options), null, 2));
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
