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
    expect(gradle).toContain(
      'apply from: "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle"',
    );
    expect(checkAndroidBundle({
      cwd: root,
      runGradle: () => 'createDebugToolkitDebugJsAndAssets',
    }).ok).toBe(true);
  });

  it('injects Kotlin apply line into build.gradle.kts', () => {
    const root = makeRoot('build.gradle.kts', 'plugins { id("com.android.application") }\n');

    setupAndroidBundle({ cwd: root });

    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle.kts'), 'utf8');
    expect(gradle).toContain(
      'apply(from = "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle")',
    );
  });

  it('undo removes only the marked block', () => {
    const root = makeRoot('build.gradle', 'plugins { id "com.android.application" }\n');

    setupAndroidBundle({ cwd: root });
    undoAndroidBundle({ cwd: root });

    const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
    expect(gradle).not.toContain('react-native-debug-toolkit: begin debug bundle');
    expect(gradle).toContain('com.android.application');
  });

  it('check runs Gradle task listing and returns false when debug task is missing', () => {
    const root = makeRoot('build.gradle', 'plugins { id "com.android.application" }\n');
    const calls = [];

    setupAndroidBundle({ cwd: root });
    const result = checkAndroidBundle({
      cwd: root,
      runGradle: (command, args, options) => {
        calls.push({ command, args, options });
        return 'createBundleReleaseJsAndAssets';
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      reason: 'gradle_task_missing',
    }));
    expect(calls).toEqual([
      expect.objectContaining({
        command: 'gradle',
        args: [':app:tasks', '--all', '--no-daemon', '--console=plain'],
        options: expect.objectContaining({ cwd: path.join(root, 'android') }),
      }),
    ]);
  });

  it('check uses android/gradlew when present and succeeds when debug task exists', () => {
    const root = makeRoot('build.gradle', 'plugins { id "com.android.application" }\n');
    const gradlew = path.join(root, 'android', 'gradlew');
    const calls = [];
    fs.writeFileSync(gradlew, '#!/bin/sh\n');

    setupAndroidBundle({ cwd: root });
    const result = checkAndroidBundle({
      cwd: root,
      runGradle: (command, args, options) => {
        calls.push({ command, args, options });
        return 'createDebugToolkitDebugJsAndAssets - Generate embedded React Native JS bundle';
      },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        command: gradlew,
        args: [':app:tasks', '--all', '--no-daemon', '--console=plain'],
        options: expect.objectContaining({ cwd: path.join(root, 'android') }),
      }),
    ]);
  });

  it('Gradle script uses a production transform for Expo embedded debug fallback bundles', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../../scripts/debug-bundle.gradle'), 'utf8');

    expect(source).toContain('isExpoProject(rootFile)');
    expect(source).toContain('"--dev", isExpoProject(rootFile) ? "false" : "true"');
    expect(source).toContain('command.addAll(["--minify", "false"])');
  });
});
