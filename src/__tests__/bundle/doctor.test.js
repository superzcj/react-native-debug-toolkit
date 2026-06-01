const fs = require('fs');
const os = require('os');
const path = require('path');
const { doctorBundle } = require('../../../scripts/bundle/doctor');

function writeIosProject(root, script) {
  const projDir = path.join(root, 'ios', 'Demo.xcodeproj');
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, 'project.pbxproj'), `{
  archiveVersion = 1;
  classes = {
  };
  objectVersion = 54;
  objects = {
/* Begin PBXProject section */
    AAA /* Project object */ = {
      isa = PBXProject;
      targets = (
        BBB /* Demo */,
      );
    };
/* End PBXProject section */
/* Begin PBXNativeTarget section */
    BBB /* Demo */ = {
      isa = PBXNativeTarget;
      name = Demo;
      productType = "com.apple.product-type.application";
      buildPhases = (
        CCC /* Bundle React Native code and images */,
      );
    };
/* End PBXNativeTarget section */
/* Begin PBXShellScriptBuildPhase section */
    CCC /* Bundle React Native code and images */ = {
      isa = PBXShellScriptBuildPhase;
      name = "Bundle React Native code and images";
      shellScript = "${script}";
    };
/* End PBXShellScriptBuildPhase section */
  };
  rootObject = AAA /* Project object */;
}
`);
}

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-doctor-'));
}

describe('doctor-bundle', () => {
  it('passes when iOS app contains main.jsbundle', async () => {
    const root = makeRoot();
    const app = path.join(root, 'Demo.app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'main.jsbundle'), 'bundle');

    await expect(doctorBundle({ platform: 'ios', app })).resolves.toEqual(
      expect.objectContaining({ ok: true, bundle: path.join(app, 'main.jsbundle') }),
    );
  });

  it('checks generated iOS bundle config when app path is omitted', async () => {
    const root = makeRoot();
    writeIosProject(root, [
      'set -e',
      'if [[ $CONFIGURATION = *Debug* ]]; then',
      ' export SKIP_BUNDLING=1',
      'fi',
      '# react-native-debug-toolkit: begin debug bundle',
      'export FORCE_BUNDLING=1',
      'unset SKIP_BUNDLING',
      '# react-native-debug-toolkit: end debug bundle',
      '../node_modules/react-native/scripts/react-native-xcode.sh',
      '',
    ].join('\\n'));

    await expect(doctorBundle({ cwd: root, platform: 'ios' })).resolves.toEqual(
      expect.objectContaining({ ok: true, platform: 'ios', mode: 'config' }),
    );
  });

  it('fails generated iOS config when Expo SKIP_BUNDLING is not cleared', async () => {
    const root = makeRoot();
    writeIosProject(root, [
      'set -e',
      'if [[ $CONFIGURATION = *Debug* ]]; then',
      ' export SKIP_BUNDLING=1',
      'fi',
      '# react-native-debug-toolkit: begin debug bundle',
      'export FORCE_BUNDLING=1',
      '# react-native-debug-toolkit: end debug bundle',
      '../node_modules/react-native/scripts/react-native-xcode.sh',
      '',
    ].join('\\n'));

    await expect(doctorBundle({ cwd: root, platform: 'ios' })).rejects.toThrow(
      /iOS debug bundle setup is not active/,
    );
  });

  it('fails when iOS app misses main.jsbundle', async () => {
    const root = makeRoot();
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

  it('checks generated Android Gradle config when APK path is omitted', async () => {
    const root = makeRoot();
    const appDir = path.join(root, 'android/app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'build.gradle'), [
      'plugins { id "com.android.application" }',
      '',
      '// react-native-debug-toolkit: begin debug bundle',
      'apply from: "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle"',
      '// react-native-debug-toolkit: end debug bundle',
      '',
    ].join('\n'));

    await expect(doctorBundle({
      cwd: root,
      platform: 'android',
      runGradle: () => 'createDebugToolkitDebugJsAndAssets',
    })).resolves.toEqual(expect.objectContaining({ ok: true, platform: 'android', mode: 'config' }));
  });
});
