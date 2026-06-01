# Debug Bundle Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old per-build `embed` path with persistent `setup-bundle` / `doctor-bundle` tooling that makes debug builds include embedded JS bundles reliably.

**Architecture:** Add focused Node modules under `scripts/bundle/` for CLI parsing, iOS pbxproj mutation, Android Gradle mutation, and artifact doctor checks. Android build integration moves from `preBuild` to a variant-aware Gradle script that registers generated assets with AGP. DevConnect runtime is adjusted to keep RN's packager reachability fallback instead of returning stale persisted hosts blindly.

**Tech Stack:** Node.js CommonJS CLI, `xcode` pbxproj parser, Android Gradle Groovy script, Jest source/unit tests, React Native iOS/Android dev support APIs.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `bin/debug-toolkit.js` | Modify | Route `setup-bundle` and `doctor-bundle`; remove old `embed` route/help. |
| `scripts/embed.js` | Delete | Old per-build setup entry. |
| `scripts/embed-ios.js` | Delete | Replaced by target-aware iOS setup module. |
| `scripts/embed-android.js` | Delete | Replaced by language-aware Android setup module. |
| `scripts/embed-expo.js` | Delete | Replaced by config plugin detection/docs path. |
| `scripts/eas-postinstall.sh` | Delete | Per-build mutation path removed. |
| `scripts/android-debug-bundle.gradle` | Delete | Replaced by variant-aware `debug-bundle.gradle`. |
| `scripts/debug-bundle.gradle` | Create | Gradle build integration; generate debug/development bundles and register generated assets/resources. |
| `scripts/bundle/cli.js` | Create | `setup-bundle`, `doctor-bundle`, argument parsing. |
| `scripts/bundle/ios.js` | Create | iOS target/phase discovery, marker injection, undo/check. |
| `scripts/bundle/android.js` | Create | Android Gradle file detection, Groovy/KTS apply injection, undo/check. |
| `scripts/bundle/doctor.js` | Create | Built `.app` / `.apk` artifact verification. |
| `app.plugin.js` | Create | Expo config plugin entry; opt-in `embedBundle` applies setup during prebuild. |
| `src/__tests__/features/nativeDevConnectSource.test.ts` | Modify | Assert iOS runtime preserves RN reachability check. |
| `ios/DebugToolkitDevConnect.mm` | Modify | Remove stale-host `packagerServerHostPort` bypass; let RN fallback decide. |
| `src/__tests__/bundle/*.test.js` | Create | CLI/setup/doctor unit tests with temp fixtures. |
| `README.md`, `README.zh-CN.md` | Modify | Document setup flow, doctor flow, no `embed`. |
| `docs/superpowers/specs/2026-06-01-debug-bundle-setup-design.md` | Already modified | Spec now says no backward-compatible `embed` alias. |

---

### Task 1: CLI Route and Old Embed Removal

**Files:**
- Modify: `bin/debug-toolkit.js`
- Create: `src/__tests__/bundle/cli.test.js`
- Create: `scripts/bundle/cli.js`
- Delete later: `scripts/embed.js`, `scripts/embed-ios.js`, `scripts/embed-android.js`, `scripts/embed-expo.js`, `scripts/eas-postinstall.sh`, `scripts/android-debug-bundle.gradle`

- [ ] **Step 1: Write failing CLI tests**

Create `src/__tests__/bundle/cli.test.js`:

```js
const { runBundleCli } = require('../../../scripts/bundle/cli');

function createIo() {
  return {
    stdout: '',
    stderr: '',
    writeOut(value) {
      this.stdout += value;
    },
    writeErr(value) {
      this.stderr += value;
    },
  };
}

describe('bundle cli', () => {
  it('routes setup-bundle', async () => {
    const io = createIo();
    const calls = [];

    const code = await runBundleCli(['setup-bundle', '--platform', 'ios', '--check'], {
      cwd: '/app',
      io,
      setupBundle: async (options) => calls.push(options),
    });

    expect(code).toBe(0);
    expect(calls).toEqual([
      expect.objectContaining({ cwd: '/app', platform: 'ios', check: true, undo: false }),
    ]);
  });

  it('routes doctor-bundle', async () => {
    const io = createIo();
    const calls = [];

    const code = await runBundleCli(['doctor-bundle', '--platform', 'android', '--apk', '/tmp/app.apk'], {
      cwd: '/app',
      io,
      doctorBundle: async (options) => calls.push(options),
    });

    expect(code).toBe(0);
    expect(calls).toEqual([
      expect.objectContaining({ platform: 'android', apk: '/tmp/app.apk' }),
    ]);
  });

  it('rejects old embed command without compat alias', async () => {
    const io = createIo();

    const code = await runBundleCli(['embed'], { cwd: '/app', io });

    expect(code).toBe(1);
    expect(io.stderr).toContain('Unknown command: embed');
    expect(io.stderr).toContain('Use: debug-toolkit setup-bundle');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run:

```bash
npm test -- src/__tests__/bundle/cli.test.js --runInBand
```

Expected: FAIL because `scripts/bundle/cli.js` does not exist.

- [ ] **Step 3: Create minimal CLI module**

Create `scripts/bundle/cli.js`:

```js
'use strict';

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function parseCommon(args, cwd) {
  return {
    cwd,
    platform: readOption(args, '--platform') || 'all',
    undo: hasFlag(args, '--undo'),
    check: hasFlag(args, '--check'),
    iosTarget: readOption(args, '--ios-target'),
    yes: hasFlag(args, '--yes'),
  };
}

async function runBundleCli(args, deps = {}) {
  const cwd = deps.cwd || process.cwd();
  const io = deps.io || {
    writeOut: (value) => process.stdout.write(value),
    writeErr: (value) => process.stderr.write(value),
  };
  const command = args[0];

  if (command === 'setup-bundle') {
    const setupBundle = deps.setupBundle || require('./setup').setupBundle;
    await setupBundle(parseCommon(args.slice(1), cwd));
    return 0;
  }

  if (command === 'doctor-bundle') {
    const doctorBundle = deps.doctorBundle || require('./doctor').doctorBundle;
    await doctorBundle({
      cwd,
      platform: readOption(args.slice(1), '--platform') || 'all',
      app: readOption(args.slice(1), '--app'),
      apk: readOption(args.slice(1), '--apk'),
    });
    return 0;
  }

  if (command === 'embed') {
    io.writeErr('Unknown command: embed\nUse: debug-toolkit setup-bundle\n');
    return 1;
  }

  io.writeErr(`Unknown command: ${command || '(none)'}\n`);
  return 1;
}

module.exports = { runBundleCli };
```

- [ ] **Step 4: Update bin route/help**

Modify `bin/debug-toolkit.js`:

```js
function printHelp() {
  process.stderr.write(
    'Usage: debug-toolkit [--host 0.0.0.0] [--port 3799] [--token dev-token] [--store ~/.react-native-debug-toolkit/daemon-devices.json] [--daemon-only]\n'
  + '       debug-toolkit setup-bundle [--platform ios|android] [--undo] [--check] [--ios-target <name>]\n'
  + '       debug-toolkit doctor-bundle --platform ios --app <path-to.app>\n'
  + '       debug-toolkit doctor-bundle --platform android --apk <path-to.apk>\n'
  + '\n'
  + 'Starts the debug toolkit: daemon (HTTP + Web Console) and MCP stdio server.\n'
  + '\n'
  + 'Commands:\n'
  + '  setup-bundle    Persistently configure host app debug builds to embed JS bundle\n'
  + '  doctor-bundle   Verify source config or built app package contains embedded bundle\n'
  + '\n'
  + 'Daemon options:\n'
  + '  --host <addr>   Host to bind (default: 0.0.0.0)\n'
  + '  --port <port>   Port to bind (default: 3799)\n'
  + '  --token <str>   Auth token for daemon endpoints\n'
  + '  --store <path>  Device log store path\n'
  + '  --daemon-only   Start only the HTTP daemon and Web Console\n'
  + '  -h, --help      Show this help\n',
  );
}
```

Replace the old embed route with:

```js
  if (['setup-bundle', 'doctor-bundle', 'embed'].includes(args[0])) {
    const { runBundleCli } = require('../scripts/bundle/cli');
    const code = await runBundleCli(args);
    if (code !== 0) {
      process.exitCode = code;
    }
    return;
  }
```

- [ ] **Step 5: Run test, verify pass**

Run:

```bash
npm test -- src/__tests__/bundle/cli.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add bin/debug-toolkit.js scripts/bundle/cli.js src/__tests__/bundle/cli.test.js
git commit -m "feat: add bundle setup cli routes"
```

---

### Task 2: iOS Persistent Setup

**Files:**
- Create: `scripts/bundle/ios.js`
- Create: `scripts/bundle/setup.js`
- Create: `src/__tests__/bundle/iosSetup.test.js`

- [ ] **Step 1: Write failing iOS setup tests**

Create `src/__tests__/bundle/iosSetup.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupIosBundle, undoIosBundle, checkIosBundle } = require('../../../scripts/bundle/ios');

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-ios-'));
  const projDir = path.join(root, 'ios', 'Demo.xcodeproj');
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, 'project.pbxproj'), `
// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {};
  objectVersion = 54;
  objects = {
    AAA /* Project object */ = {
      isa = PBXProject;
      targets = (BBB /* Demo */);
    };
    BBB /* Demo */ = {
      isa = PBXNativeTarget;
      name = Demo;
      productType = "com.apple.product-type.application";
      buildPhases = (CCC /* Bundle React Native code and images */);
    };
    CCC /* Bundle React Native code and images */ = {
      isa = PBXShellScriptBuildPhase;
      name = "Bundle React Native code and images";
      shellScript = "set -e\\n../node_modules/react-native/scripts/react-native-xcode.sh\\n";
    };
  };
  rootObject = AAA /* Project object */;
}
`);
  return root;
}

describe('ios bundle setup', () => {
  it('injects FORCE_BUNDLING into the app target bundle phase', () => {
    const root = fixtureRoot();

    const result = setupIosBundle({ cwd: root, iosTarget: 'Demo' });

    expect(result.changed).toBe(true);
    const pbx = fs.readFileSync(path.join(root, 'ios/Demo.xcodeproj/project.pbxproj'), 'utf8');
    expect(pbx).toContain('# react-native-debug-toolkit: begin debug bundle');
    expect(pbx).toContain('export FORCE_BUNDLING=1');
    expect(checkIosBundle({ cwd: root, iosTarget: 'Demo' }).ok).toBe(true);
  });

  it('undo removes only the marked block', () => {
    const root = fixtureRoot();

    setupIosBundle({ cwd: root, iosTarget: 'Demo' });
    undoIosBundle({ cwd: root, iosTarget: 'Demo' });

    const pbx = fs.readFileSync(path.join(root, 'ios/Demo.xcodeproj/project.pbxproj'), 'utf8');
    expect(pbx).not.toContain('react-native-debug-toolkit: begin debug bundle');
    expect(pbx).toContain('react-native-xcode.sh');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- src/__tests__/bundle/iosSetup.test.js --runInBand
```

Expected: FAIL because `scripts/bundle/ios.js` does not exist.

- [ ] **Step 3: Implement iOS module**

Create `scripts/bundle/ios.js`:

```js
'use strict';

const fs = require('fs');
const path = require('path');
const xcode = require('xcode');

const PHASE_NAME = 'Bundle React Native code and images';
const BEGIN = '# react-native-debug-toolkit: begin debug bundle';
const END = '# react-native-debug-toolkit: end debug bundle';
const BLOCK = `${BEGIN}\nexport FORCE_BUNDLING=1\n${END}`;

function findProjects(cwd) {
  const iosDir = path.join(cwd, 'ios');
  if (!fs.existsSync(iosDir)) return [];
  return fs.readdirSync(iosDir)
    .filter((entry) => entry.endsWith('.xcodeproj') && entry !== 'Pods.xcodeproj')
    .map((entry) => path.join(iosDir, entry, 'project.pbxproj'))
    .filter((file) => fs.existsSync(file));
}

function decodeScript(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value || '';
  }
}

function encodeScript(value) {
  return JSON.stringify(value);
}

function sectionName(section) {
  return String(section.name || section.comment || '').replace(/^"|"$/g, '');
}

function loadTarget(cwd, iosTarget) {
  const projects = findProjects(cwd);
  if (projects.length !== 1) {
    throw new Error(`Expected one Xcode project, found ${projects.length}. Pass --ios-target after selecting the app project.`);
  }

  const pbxFile = projects[0];
  const proj = xcode.project(pbxFile).parseSync();
  const objects = proj.hash.project.objects;
  const nativeTargets = objects.PBXNativeTarget || {};
  const phases = objects.PBXShellScriptBuildPhase || {};

  const appTargets = Object.entries(nativeTargets)
    .filter(([key, target]) => !key.endsWith('_comment') && target.productType === '"com.apple.product-type.application"');

  const matches = iosTarget
    ? appTargets.filter(([, target]) => String(target.name || '').replace(/^"|"$/g, '') === iosTarget)
    : appTargets;

  if (matches.length !== 1) {
    throw new Error(`Expected one iOS app target, found ${matches.length}. Pass --ios-target <name>.`);
  }

  const [, target] = matches[0];
  const buildPhases = target.buildPhases || [];
  for (const phaseRef of buildPhases) {
    const phaseId = typeof phaseRef === 'string' ? phaseRef : phaseRef.value;
    const phase = phases[phaseId];
    if (phase && sectionName(phase) === PHASE_NAME) {
      const script = decodeScript(phase.shellScript);
      if (!script.includes('react-native-xcode.sh') && !script.includes('with-environment.sh')) {
        throw new Error(`${PHASE_NAME} does not call React Native bundling script.`);
      }
      return { pbxFile, proj, phase };
    }
  }

  throw new Error(`${PHASE_NAME} phase not found on iOS app target.`);
}

function insertBlock(script) {
  if (script.includes(BEGIN)) return script;
  return `${BLOCK}\n${script}`;
}

function removeBlock(script) {
  const pattern = new RegExp(`${BEGIN}\\nexport FORCE_BUNDLING=1\\n${END}\\n?`, 'g');
  return script.replace(pattern, '');
}

function setupIosBundle(options) {
  const ctx = loadTarget(options.cwd, options.iosTarget);
  const script = decodeScript(ctx.phase.shellScript);
  const next = insertBlock(script);
  if (next === script) return { ok: true, changed: false };
  ctx.phase.shellScript = encodeScript(next);
  fs.writeFileSync(ctx.pbxFile, ctx.proj.writeSync());
  return { ok: true, changed: true };
}

function undoIosBundle(options) {
  const ctx = loadTarget(options.cwd, options.iosTarget);
  const script = decodeScript(ctx.phase.shellScript);
  const next = removeBlock(script);
  if (next === script) return { ok: true, changed: false };
  ctx.phase.shellScript = encodeScript(next);
  fs.writeFileSync(ctx.pbxFile, ctx.proj.writeSync());
  return { ok: true, changed: true };
}

function checkIosBundle(options) {
  const ctx = loadTarget(options.cwd, options.iosTarget);
  const script = decodeScript(ctx.phase.shellScript);
  return { ok: script.includes(BEGIN) && script.includes('export FORCE_BUNDLING=1') };
}

module.exports = { setupIosBundle, undoIosBundle, checkIosBundle, BEGIN, END };
```

- [ ] **Step 4: Create setup orchestrator**

Create `scripts/bundle/setup.js`:

```js
'use strict';

const { setupIosBundle, undoIosBundle, checkIosBundle } = require('./ios');
const { setupAndroidBundle, undoAndroidBundle, checkAndroidBundle } = require('./android');

async function setupBundle(options) {
  const platforms = options.platform === 'all' ? ['ios', 'android'] : [options.platform];
  const results = [];

  for (const platform of platforms) {
    if (platform === 'ios') {
      if (options.undo) results.push(undoIosBundle(options));
      else if (options.check) results.push(checkIosBundle(options));
      else results.push(setupIosBundle(options));
    } else if (platform === 'android') {
      if (options.undo) results.push(undoAndroidBundle(options));
      else if (options.check) results.push(checkAndroidBundle(options));
      else results.push(setupAndroidBundle(options));
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  return results;
}

module.exports = { setupBundle };
```

Create placeholder Android module so iOS tests can import setup:

```js
'use strict';

function setupAndroidBundle() {
  throw new Error('Android bundle setup not implemented yet.');
}
function undoAndroidBundle() {
  throw new Error('Android bundle undo not implemented yet.');
}
function checkAndroidBundle() {
  throw new Error('Android bundle check not implemented yet.');
}

module.exports = { setupAndroidBundle, undoAndroidBundle, checkAndroidBundle };
```

Save placeholder as `scripts/bundle/android.js`.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/__tests__/bundle/iosSetup.test.js src/__tests__/bundle/cli.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/bundle/ios.js scripts/bundle/setup.js scripts/bundle/android.js src/__tests__/bundle/iosSetup.test.js
git commit -m "feat: add iOS debug bundle setup"
```

---

### Task 3: Android Persistent Setup and Variant Gradle Script

**Files:**
- Modify: `scripts/bundle/android.js`
- Create: `scripts/debug-bundle.gradle`
- Create: `src/__tests__/bundle/androidSetup.test.js`

- [ ] **Step 1: Write failing Android setup tests**

Create `src/__tests__/bundle/androidSetup.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupAndroidBundle, undoAndroidBundle, checkAndroidBundle } = require('../../../scripts/bundle/android');

function makeRoot(fileName, initial) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-android-'));
  const appDir = path.join(root, 'android', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, fileName), initial);
  return root;
}

describe('android bundle setup', () => {
  it('injects Groovy apply line into build.gradle', () => {
    const root = makeRoot('build.gradle', 'plugins { id "com.android.application" }\n');

    const result = setupAndroidBundle({ cwd: root });

    expect(result.changed).toBe(true);
    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toContain('// react-native-debug-toolkit: begin debug bundle');
    expect(gradle).toContain('apply from: "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle"');
    expect(checkAndroidBundle({ cwd: root }).ok).toBe(true);
  });

  it('injects Kotlin apply line into build.gradle.kts', () => {
    const root = makeRoot('build.gradle.kts', 'plugins { id("com.android.application") }\n');

    setupAndroidBundle({ cwd: root });

    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle.kts'), 'utf8');
    expect(gradle).toContain('apply(from = "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle")');
  });

  it('undo removes only marked block', () => {
    const root = makeRoot('build.gradle', 'plugins { id "com.android.application" }\n');

    setupAndroidBundle({ cwd: root });
    undoAndroidBundle({ cwd: root });

    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    expect(gradle).not.toContain('react-native-debug-toolkit: begin debug bundle');
    expect(gradle).toContain('com.android.application');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- src/__tests__/bundle/androidSetup.test.js --runInBand
```

Expected: FAIL because Android module is placeholder.

- [ ] **Step 3: Implement Android setup module**

Replace `scripts/bundle/android.js` with:

```js
'use strict';

const fs = require('fs');
const path = require('path');

const BEGIN = '// react-native-debug-toolkit: begin debug bundle';
const END = '// react-native-debug-toolkit: end debug bundle';
const REL_SCRIPT = '../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle';

function findGradleFile(cwd) {
  const groovy = path.join(cwd, 'android/app/build.gradle');
  const kotlin = path.join(cwd, 'android/app/build.gradle.kts');
  if (fs.existsSync(kotlin)) return { file: kotlin, kind: 'kotlin' };
  if (fs.existsSync(groovy)) return { file: groovy, kind: 'groovy' };
  throw new Error('android/app/build.gradle(.kts) not found.');
}

function block(kind) {
  const applyLine = kind === 'kotlin'
    ? `apply(from = "${REL_SCRIPT}")`
    : `apply from: "${REL_SCRIPT}"`;
  return `${BEGIN}\n${applyLine}\n${END}`;
}

function removeBlock(content) {
  return content.replace(/\/\/ react-native-debug-toolkit: begin debug bundle\n[\s\S]*?\/\/ react-native-debug-toolkit: end debug bundle\n?/g, '');
}

function setupAndroidBundle(options) {
  const gradle = findGradleFile(options.cwd);
  const content = fs.readFileSync(gradle.file, 'utf8');
  if (content.includes(BEGIN)) return { ok: true, changed: false, file: gradle.file };
  fs.writeFileSync(gradle.file, `${content.trimEnd()}\n\n${block(gradle.kind)}\n`);
  return { ok: true, changed: true, file: gradle.file };
}

function undoAndroidBundle(options) {
  const gradle = findGradleFile(options.cwd);
  const content = fs.readFileSync(gradle.file, 'utf8');
  const next = removeBlock(content).replace(/\n{3,}/g, '\n\n');
  if (next === content) return { ok: true, changed: false, file: gradle.file };
  fs.writeFileSync(gradle.file, next);
  return { ok: true, changed: true, file: gradle.file };
}

function checkAndroidBundle(options) {
  const gradle = findGradleFile(options.cwd);
  const content = fs.readFileSync(gradle.file, 'utf8');
  return { ok: content.includes(BEGIN) && content.includes('scripts/debug-bundle.gradle'), file: gradle.file };
}

module.exports = { setupAndroidBundle, undoAndroidBundle, checkAndroidBundle, BEGIN, END };
```

- [ ] **Step 4: Add variant-aware Gradle script**

Create `scripts/debug-bundle.gradle`:

```groovy
// react-native-debug-toolkit: persistent debug/development bundle generation

def toolkitCapitalize = { String value ->
  value.length() == 0 ? value : value.substring(0, 1).toUpperCase(Locale.ROOT) + value.substring(1)
}

def toolkitReactExt = project.extensions.findByName("react")

def toolkitProviderValue = { provider, fallback ->
  try {
    return provider != null && provider.isPresent() ? provider.get() : fallback
  } catch (Throwable ignored) {
    return fallback
  }
}

def toolkitListValue = { provider, fallback ->
  try {
    return provider != null ? provider.get() : fallback
  } catch (Throwable ignored) {
    return fallback
  }
}

def toolkitRoot = toolkitProviderValue(toolkitReactExt?.root, project.rootDir)
def toolkitBundleAssetName = toolkitProviderValue(toolkitReactExt?.bundleAssetName, "index.android.bundle")
def toolkitBundleCommand = toolkitProviderValue(toolkitReactExt?.bundleCommand, "bundle")
def toolkitExtraPackagerArgs = toolkitListValue(toolkitReactExt?.extraPackagerArgs, [])
def toolkitNodeArgs = toolkitListValue(toolkitReactExt?.nodeExecutableAndArgs, ["node"])
def toolkitDebuggableVariants = toolkitListValue(toolkitReactExt?.debuggableVariants, ["debug"])

def toolkitCliFile = toolkitProviderValue(toolkitReactExt?.cliFile, null)
if (toolkitCliFile == null) {
  toolkitCliFile = project.file("${toolkitRoot}/node_modules/react-native/cli.js")
}

def toolkitEntryFile = toolkitProviderValue(toolkitReactExt?.entryFile, null)
if (toolkitEntryFile == null) {
  def androidEntry = project.file("${toolkitRoot}/index.android.js")
  toolkitEntryFile = androidEntry.exists() ? androidEntry : project.file("${toolkitRoot}/index.js")
}

androidComponents {
  onVariants(selector().all()) { variant ->
    def variantName = variant.name
    def isDebuggable = toolkitDebuggableVariants.any { it.equalsIgnoreCase(variantName) }
    if (!isDebuggable) {
      return
    }

    def capName = toolkitCapitalize(variantName)
    def generatedRoot = project.layout.buildDirectory.dir("generated/react-native-debug-toolkit/${variantName}")
    def bundleDir = generatedRoot.map { it.dir("assets") }
    def resDir = generatedRoot.map { it.dir("res") }

    def bundleTask = tasks.register("createDebugToolkit${capName}JsAndAssets", Exec) {
      group = "react"
      description = "Generate embedded React Native JS bundle for ${variantName} debug build."
      workingDir toolkitRoot

      doFirst {
        bundleDir.get().asFile.mkdirs()
        resDir.get().asFile.mkdirs()
      }

      commandLine(
        toolkitNodeArgs + [
          toolkitCliFile.absolutePath,
          toolkitBundleCommand,
          "--platform", "android",
          "--dev", "true",
          "--entry-file", toolkitEntryFile.absolutePath,
          "--bundle-output", new File(bundleDir.get().asFile, toolkitBundleAssetName).absolutePath,
          "--assets-dest", resDir.get().asFile.absolutePath
        ] + toolkitExtraPackagerArgs
      )
    }

    variant.sources.assets?.addGeneratedSourceDirectory(bundleTask) { bundleDir.get().asFile }
    variant.sources.res?.addGeneratedSourceDirectory(bundleTask) { resDir.get().asFile }
  }
}
```

- [ ] **Step 5: Run setup tests**

```bash
npm test -- src/__tests__/bundle/androidSetup.test.js src/__tests__/bundle/iosSetup.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Validate Gradle task in Demo**

Apply the script manually to Demo for validation only; do not commit Demo mutation unless it is already intended fixture work:

```bash
printf '\\n// react-native-debug-toolkit: begin debug bundle\\napply from: "../../scripts/debug-bundle.gradle"\\n// react-native-debug-toolkit: end debug bundle\\n' >> Demo/android/app/build.gradle
cd Demo/android && ./gradlew :app:tasks --all | rg createDebugToolkitDebugJsAndAssets
git checkout -- Demo/android/app/build.gradle
```

Expected: task listed. If Gradle API closure signature fails, fix `scripts/debug-bundle.gradle` before proceeding.

- [ ] **Step 7: Commit**

```bash
git add scripts/bundle/android.js scripts/debug-bundle.gradle src/__tests__/bundle/androidSetup.test.js
git commit -m "feat: add Android debug bundle setup"
```

---

### Task 4: Bundle Artifact Doctor

**Files:**
- Create: `scripts/bundle/doctor.js`
- Create: `src/__tests__/bundle/doctor.test.js`

- [ ] **Step 1: Write failing doctor tests**

Create `src/__tests__/bundle/doctor.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { doctorBundle } = require('../../../scripts/bundle/doctor');

describe('doctor-bundle', () => {
  it('passes when iOS app contains main.jsbundle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-app-'));
    const app = path.join(root, 'Demo.app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'main.jsbundle'), 'bundle');

    await expect(doctorBundle({ platform: 'ios', app })).resolves.toEqual(
      expect.objectContaining({ ok: true, bundle: path.join(app, 'main.jsbundle') }),
    );
  });

  it('fails when iOS app misses main.jsbundle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-app-'));
    const app = path.join(root, 'Demo.app');
    fs.mkdirSync(app);

    await expect(doctorBundle({ platform: 'ios', app })).rejects.toThrow('main.jsbundle not found');
  });

  it('checks APK zip listing through injected reader', async () => {
    const readZipEntries = jest.fn(async () => ['AndroidManifest.xml', 'assets/index.android.bundle']);

    await expect(doctorBundle({
      platform: 'android',
      apk: '/tmp/app-debug.apk',
      readZipEntries,
    })).resolves.toEqual(expect.objectContaining({ ok: true, bundle: 'assets/index.android.bundle' }));
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- src/__tests__/bundle/doctor.test.js --runInBand
```

Expected: FAIL because doctor module does not exist.

- [ ] **Step 3: Implement doctor**

Create `scripts/bundle/doctor.js`:

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function readZipEntriesWithUnzip(file) {
  const output = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

async function doctorIos(options) {
  if (!options.app) throw new Error('--app is required for iOS doctor.');
  const bundle = path.join(options.app, 'main.jsbundle');
  if (!fs.existsSync(bundle)) {
    throw new Error(`main.jsbundle not found in ${options.app}`);
  }
  return { ok: true, platform: 'ios', bundle };
}

async function doctorAndroid(options) {
  if (!options.apk) throw new Error('--apk is required for Android doctor.');
  const readZipEntries = options.readZipEntries || readZipEntriesWithUnzip;
  const entries = await readZipEntries(options.apk);
  const bundle = entries.find((entry) => /^assets\/.+\.bundle$/.test(entry));
  if (!bundle) {
    throw new Error(`Android JS bundle not found in ${options.apk}`);
  }
  return { ok: true, platform: 'android', bundle };
}

async function doctorBundle(options) {
  if (options.platform === 'ios') return doctorIos(options);
  if (options.platform === 'android') return doctorAndroid(options);
  throw new Error(`Unsupported platform for doctor-bundle: ${options.platform}`);
}

module.exports = { doctorBundle, readZipEntriesWithUnzip };
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/__tests__/bundle/doctor.test.js src/__tests__/bundle/cli.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/bundle/doctor.js src/__tests__/bundle/doctor.test.js
git commit -m "feat: add bundle artifact doctor"
```

---

### Task 5: Remove Old Embed Files

**Files:**
- Delete: `scripts/embed.js`
- Delete: `scripts/embed-ios.js`
- Delete: `scripts/embed-android.js`
- Delete: `scripts/embed-expo.js`
- Delete: `scripts/eas-postinstall.sh`
- Delete: `scripts/android-debug-bundle.gradle`
- Modify: `bin/debug-toolkit.js`
- Modify: `package.json` if package file list or dependency no longer needs old paths

- [ ] **Step 1: Write no-old-embed source contract**

Create `src/__tests__/bundle/noEmbedCompat.test.js`:

```js
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

describe('no old embed compatibility path', () => {
  it('does not ship old embed scripts', () => {
    for (const file of [
      'scripts/embed.js',
      'scripts/embed-ios.js',
      'scripts/embed-android.js',
      'scripts/embed-expo.js',
      'scripts/eas-postinstall.sh',
      'scripts/android-debug-bundle.gradle',
    ]) {
      expect(fs.existsSync(path.join(repoRoot, file))).toBe(false);
    }
  });

  it('bin help does not advertise embed', () => {
    const bin = fs.readFileSync(path.join(repoRoot, 'bin/debug-toolkit.js'), 'utf8');
    expect(bin).not.toContain('debug-toolkit embed');
    expect(bin).toContain('setup-bundle');
    expect(bin).toContain('doctor-bundle');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- src/__tests__/bundle/noEmbedCompat.test.js --runInBand
```

Expected: FAIL because old files still exist.

- [ ] **Step 3: Delete old files**

```bash
git rm scripts/embed.js scripts/embed-ios.js scripts/embed-android.js scripts/embed-expo.js scripts/eas-postinstall.sh scripts/android-debug-bundle.gradle
```

- [ ] **Step 4: Remove stale references**

Run:

```bash
rg -n "debug-toolkit embed|scripts/embed|android-debug-bundle|eas-postinstall|\\.debug-toolkit-embed" .
```

Expected remaining hits only in historical spec `docs/superpowers/specs/2026-05-29-embed-debug-bundle-design.md` and discussion notes. If public README or CLI still hits, edit them in Task 8.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/__tests__/bundle/noEmbedCompat.test.js src/__tests__/bundle/cli.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A scripts bin/debug-toolkit.js src/__tests__/bundle/noEmbedCompat.test.js
git commit -m "refactor: remove old embed command path"
```

---

### Task 6: iOS Runtime Stale Host Fallback

**Files:**
- Modify: `ios/DebugToolkitDevConnect.mm`
- Modify: `src/__tests__/features/nativeDevConnectSource.test.ts`

- [ ] **Step 1: Update source contract test**

Modify iOS test in `src/__tests__/features/nativeDevConnectSource.test.ts`:

```ts
    // Do not bypass RN's packager reachability check. A persisted stale host must be allowed to
    // fall back through RCTBundleURLProvider instead of being returned blindly.
    expect(source).not.toContain('return host;\\n}');
    expect(source).not.toContain('replacement_packagerServerHostPort');
    expect(source).toContain('DevConnectSetPersistedMetroHost');
    expect(source).toContain('settings.jsLocation = normalized');
```

Remove expectations for:

```ts
    expect(source).toContain('replacement_packagerServerHostPort');
    expect(source).toContain('packagerHookInstalled');
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- src/__tests__/features/nativeDevConnectSource.test.ts --runInBand
```

Expected: FAIL because current iOS source still has `replacement_packagerServerHostPort`.

- [ ] **Step 3: Remove stale host packager hook**

Modify `ios/DebugToolkitDevConnect.mm`:

```objc
static BOOL gBundleRootHookInstalled = NO;
```

Delete:

```objc
static BOOL gPackagerHookInstalled = NO;
static NSString *replacement_packagerServerHostPort(id self, SEL _cmd) { ... }
static void DebugToolkitInstallPackagerHook(Class cls) { ... }
```

Change `DebugToolkitInstallAllHooks` to only install bundle-root hook:

```objc
static void DebugToolkitInstallAllHooks(void)
{
  if (gBundleRootHookInstalled) {
    return;
  }

  Class cls = NSClassFromString(@"RCTBundleURLProvider");
  if (!cls) {
    NSLog(@"[DevConnect] RCTBundleURLProvider not loaded — hooks will retry");
    return;
  }

  DebugToolkitInstallBundleRootHook(cls);

  static BOOL didLogOutcome = NO;
  if (!didLogOutcome) {
    didLogOutcome = YES;
    if (DevConnectEmbeddedFirstHooksActive()) {
      NSLog(@"[DevConnect] embedded-first hook active");
    } else {
      NSLog(@"[DevConnect] embedded-first hook FAILED — rebuild / check React linkage");
    }
  }
}
```

Change diagnostics:

```objc
    @"packagerHookInstalled": @NO,
    @"bundleRootHookInstalled": @(gBundleRootHookInstalled),
```

Keep `applyMetroHost` as:

```objc
    DevConnectSetPersistedMetroHost(normalized);
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    settings.jsLocation = normalized;
    NSURL *bundleURL = [settings jsBundleURLForBundleRoot:DevConnectMetroBundleRoot()];
```

RN's own `packagerServerHostPort` now checks reachability before returning the persisted host.

- [ ] **Step 4: Run test**

```bash
npm test -- src/__tests__/features/nativeDevConnectSource.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/DebugToolkitDevConnect.mm src/__tests__/features/nativeDevConnectSource.test.ts
git commit -m "fix: preserve iOS Metro fallback for stale hosts"
```

---

### Task 7: Expo Config Plugin

**Files:**
- Create: `app.plugin.js`
- Create: `src/__tests__/bundle/expoPlugin.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write plugin test**

Create `src/__tests__/bundle/expoPlugin.test.js`:

```js
const plugin = require('../../../app.plugin');

describe('expo config plugin', () => {
  it('exports a function and leaves config unchanged when embedBundle is false', () => {
    const config = { name: 'Demo', slug: 'demo' };
    expect(plugin(config, { embedBundle: false })).toBe(config);
  });

  it('marks plugin intent when embedBundle is true in test fallback mode', () => {
    const config = { name: 'Demo', slug: 'demo' };
    const result = plugin(config, { embedBundle: true, _testOnly: true });
    expect(result.extra.reactNativeDebugToolkit.embedBundle).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- src/__tests__/bundle/expoPlugin.test.js --runInBand
```

Expected: FAIL because `app.plugin.js` does not exist.

- [ ] **Step 3: Implement plugin**

Create `app.plugin.js`:

```js
'use strict';

function withDebugToolkitDevClient(config, props = {}) {
  if (!props.embedBundle) {
    return config;
  }

  if (props._testOnly) {
    config.extra = config.extra || {};
    config.extra.reactNativeDebugToolkit = {
      ...(config.extra.reactNativeDebugToolkit || {}),
      embedBundle: true,
    };
    return config;
  }

  let plugins;
  try {
    plugins = require('@expo/config-plugins');
  } catch {
    throw new Error('react-native-debug-toolkit/dev-client requires @expo/config-plugins during Expo prebuild.');
  }

  const { withDangerousMod } = plugins;
  const { setupIosBundle } = require('./scripts/bundle/ios');
  const { setupAndroidBundle } = require('./scripts/bundle/android');

  config = withDangerousMod(config, ['ios', async (modConfig) => {
    setupIosBundle({ cwd: modConfig.modRequest.projectRoot, iosTarget: props.iosTarget });
    return modConfig;
  }]);

  config = withDangerousMod(config, ['android', async (modConfig) => {
    setupAndroidBundle({ cwd: modConfig.modRequest.projectRoot });
    return modConfig;
  }]);

  return config;
}

module.exports = withDebugToolkitDevClient;
```

No package export map exists now. Because `app.plugin.js` is in package root and `files` includes `scripts`, `bin`, `src`, root files need package `files` update:

```json
"files": [
  "src",
  "lib",
  "bin",
  "node",
  "scripts",
  "ios",
  "android",
  "app.plugin.js",
  "react-native-debug-toolkit.podspec",
  "README.md",
  "LICENSE",
  "!**/__tests__",
  "!**/__fixtures__",
  "!**/__mocks__"
]
```

- [ ] **Step 4: Run test**

```bash
npm test -- src/__tests__/bundle/expoPlugin.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app.plugin.js package.json package-lock.json src/__tests__/bundle/expoPlugin.test.js
git commit -m "feat: add Expo debug bundle config plugin"
```

---

### Task 8: Docs Update

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Replace DevConnect bundle docs**

In both READMEs, replace the Remote JS Bundle note with concise setup docs:

```md
### Embedded debug bundle

Debug builds need an embedded JS bundle for cold start when Metro is off.

Bare React Native:

```bash
npm exec -- debug-toolkit setup-bundle
git diff
git commit -am "chore: enable debug bundle embedding"
```

Expo dev-client:

```json
{
  "expo": {
    "plugins": [
      ["react-native-debug-toolkit/dev-client", { "embedBundle": true }]
    ]
  }
}
```

Verify built artifacts:

```bash
npm exec -- debug-toolkit doctor-bundle --platform ios --app path/to/App.app
npm exec -- debug-toolkit doctor-bundle --platform android --apk path/to/app-debug.apk
```

After setup, build machines run normal Xcode/Gradle/EAS commands. Do not run a per-build embed command.
```

Chinese version:

```md
### Debug 包内置 bundle

Debug 包要在 Metro 关闭时冷启动，必须内置 JS bundle。

Bare React Native:

```bash
npm exec -- debug-toolkit setup-bundle
git diff
git commit -am "chore: enable debug bundle embedding"
```

Expo dev-client:

```json
{
  "expo": {
    "plugins": [
      ["react-native-debug-toolkit/dev-client", { "embedBundle": true }]
    ]
  }
}
```

验证产物：

```bash
npm exec -- debug-toolkit doctor-bundle --platform ios --app path/to/App.app
npm exec -- debug-toolkit doctor-bundle --platform android --apk path/to/app-debug.apk
```

setup 后配置进仓库，打包机继续跑正常 Xcode/Gradle/EAS 命令。不要每次打包跑 embed。
```

- [ ] **Step 2: Remove old embed mentions**

Run:

```bash
rg -n "debug-toolkit embed|per-build embed|eas-postinstall|android-debug-bundle|scripts/embed" README.md README.zh-CN.md bin scripts src package.json
```

Expected: no hits.

- [ ] **Step 3: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: document persistent debug bundle setup"
```

---

### Task 9: Verification Gates

**Files:**
- No new source files unless failures require fixes.

- [ ] **Step 1: Run targeted Jest**

```bash
npm test -- src/__tests__/bundle/cli.test.js src/__tests__/bundle/iosSetup.test.js src/__tests__/bundle/androidSetup.test.js src/__tests__/bundle/doctor.test.js src/__tests__/bundle/noEmbedCompat.test.js src/__tests__/bundle/expoPlugin.test.js src/__tests__/features/nativeDevConnectSource.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run package gates**

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
npm_config_cache=/tmp/react-native-debug-toolkit-npm-cache npm pack --dry-run
```

Expected: all pass.

- [ ] **Step 3: Inspect package contents**

Confirm pack output includes:

```text
package/bin/debug-toolkit.js
package/scripts/bundle/cli.js
package/scripts/bundle/ios.js
package/scripts/bundle/android.js
package/scripts/bundle/doctor.js
package/scripts/debug-bundle.gradle
package/app.plugin.js
```

Confirm pack output does not include:

```text
package/scripts/embed.js
package/scripts/android-debug-bundle.gradle
package/scripts/eas-postinstall.sh
```

- [ ] **Step 4: Commit any verification fixes**

If verification forces fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize debug bundle setup packaging"
```

---

## Self-Review

- Spec coverage: `setup-bundle`, `doctor-bundle`, iOS target phase, Android variant assets, Expo plugin, stale host fallback, no `embed` alias all mapped to tasks.
- Placeholder scan: no TBD/TODO placeholders.
- Scope risk: Android Gradle script API is highest risk; Task 3 includes live Demo Gradle task validation before proceeding.
- Type consistency: CLI commands use `setup-bundle` and `doctor-bundle` throughout. Old `embed` retained only in deletion tests and historical spec.
