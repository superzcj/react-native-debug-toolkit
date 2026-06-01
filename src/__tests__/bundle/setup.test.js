const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupBundle } = require('../../../scripts/bundle/setup');

function writeIosProject(root) {
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
      shellScript = "set -e\\n../node_modules/react-native/scripts/react-native-xcode.sh\\n";
    };
/* End PBXShellScriptBuildPhase section */
  };
  rootObject = AAA /* Project object */;
}
`);
}

function writeAndroidProject(root) {
  const appDir = path.join(root, 'android', 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'build.gradle'), 'plugins { id "com.android.application" }\n');
}

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-setup-'));
}

describe('setup bundle platform detection', () => {
  it('configures only iOS when platform is all and Android project is absent', async () => {
    const root = fixtureRoot();
    writeIosProject(root);

    await expect(setupBundle({ cwd: root, platform: 'all' })).resolves.toEqual([
      expect.objectContaining({ ok: true }),
    ]);
  });

  it('configures only Android when platform is all and iOS project is absent', async () => {
    const root = fixtureRoot();
    writeAndroidProject(root);

    await expect(setupBundle({ cwd: root, platform: 'all' })).resolves.toEqual([
      expect.objectContaining({ ok: true, file: path.join(root, 'android/app/build.gradle') }),
    ]);
  });

  it('reports a helpful error when no native projects are found', async () => {
    const root = fixtureRoot();

    await expect(setupBundle({ cwd: root, platform: 'all' })).rejects.toThrow(
      /No iOS or Android native project found/,
    );
  });

  it('keeps explicit Android setup strict', async () => {
    const root = fixtureRoot();

    await expect(setupBundle({ cwd: root, platform: 'android' })).rejects.toThrow(
      /android\/app\/build.gradle\(.kts\) not found/,
    );
  });
});
