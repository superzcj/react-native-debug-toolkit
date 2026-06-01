const fs = require('fs');
const os = require('os');
const path = require('path');
const { setupIosBundle, undoIosBundle, checkIosBundle } = require('../../../scripts/bundle/ios');

function targetBlock({ id, name, phaseId, productType = 'com.apple.product-type.application' }) {
  return `
    ${id} /* ${name} */ = {
      isa = PBXNativeTarget;
      name = ${name};
      productType = "${productType}";
      buildPhases = (
        ${phaseId} /* Bundle React Native code and images */,
      );
    };`;
}

function phaseBlock({ id, script }) {
  return `
    ${id} /* Bundle React Native code and images */ = {
      isa = PBXShellScriptBuildPhase;
      name = "Bundle React Native code and images";
      shellScript = "${script}";
    };`;
}

function writeProject(root, { targets, phases }) {
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
        ${targets.map((target) => `${target.id} /* ${target.name} */`).join(',\n        ')},
      );
    };
/* End PBXProject section */
/* Begin PBXNativeTarget section */
${targets.map(targetBlock).join('\n')}
/* End PBXNativeTarget section */
/* Begin PBXShellScriptBuildPhase section */
${phases.map(phaseBlock).join('\n')}
/* End PBXShellScriptBuildPhase section */
  };
  rootObject = AAA /* Project object */;
}
`);
}

function fixtureRoot(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-ios-'));
  const script = options.script || 'set -e\\n../node_modules/react-native/scripts/react-native-xcode.sh\\n';
  const targets = options.targets || [{ id: 'BBB', name: 'Demo', phaseId: 'CCC' }];
  const phases = options.phases || [{ id: 'CCC', script }];
  writeProject(root, { targets, phases });
  return root;
}

function readPbx(root) {
  return fs.readFileSync(path.join(root, 'ios/Demo.xcodeproj/project.pbxproj'), 'utf8');
}

describe('ios bundle setup', () => {
  it('injects FORCE_BUNDLING into the app target bundle phase', () => {
    const root = fixtureRoot();

    const result = setupIosBundle({ cwd: root, iosTarget: 'Demo' });

    expect(result.changed).toBe(true);
    const pbx = readPbx(root);
    expect(pbx).toContain('# react-native-debug-toolkit: begin debug bundle');
    expect(pbx).toContain('export FORCE_BUNDLING=1');
    expect(checkIosBundle({ cwd: root, iosTarget: 'Demo' }).ok).toBe(true);
  });

  it('clears Expo Debug SKIP_BUNDLING after Expo sets it', () => {
    const root = fixtureRoot({
      script: [
        'set -e',
        'if [[ $CONFIGURATION = *Debug* ]]; then',
        ' export SKIP_BUNDLING=1',
        'fi',
        '../node_modules/react-native/scripts/react-native-xcode.sh',
        '',
      ].join('\\n'),
    });

    setupIosBundle({ cwd: root, iosTarget: 'Demo' });

    const pbx = readPbx(root);
    const skipIndex = pbx.indexOf('export SKIP_BUNDLING=1');
    const unsetIndex = pbx.indexOf('unset SKIP_BUNDLING');
    const forceIndex = pbx.indexOf('export FORCE_BUNDLING=1');
    expect(skipIndex).toBeGreaterThan(-1);
    expect(unsetIndex).toBeGreaterThan(skipIndex);
    expect(forceIndex).toBeGreaterThan(skipIndex);
    expect(pbx).toContain('--dev false --minify false');
    expect(unsetIndex).toBeLessThan(pbx.indexOf('react-native-xcode.sh'));
  });

  it('migrates an existing old marker so Expo Debug bundling is not skipped', () => {
    const root = fixtureRoot({
      script: [
        '# react-native-debug-toolkit: begin debug bundle',
        'export FORCE_BUNDLING=1',
        '# react-native-debug-toolkit: end debug bundle',
        'set -e',
        'if [[ $CONFIGURATION = *Debug* ]]; then',
        ' export SKIP_BUNDLING=1',
        'fi',
        '../node_modules/react-native/scripts/react-native-xcode.sh',
        '',
      ].join('\\n'),
    });

    setupIosBundle({ cwd: root, iosTarget: 'Demo' });

    const pbx = readPbx(root);
    expect(pbx.match(/react-native-debug-toolkit: begin debug bundle/g)).toHaveLength(1);
    expect(pbx.indexOf('unset SKIP_BUNDLING')).toBeGreaterThan(pbx.indexOf('export SKIP_BUNDLING=1'));
    expect(pbx).toContain('--dev false --minify false');
  });

  it('undo removes only the marked block', () => {
    const root = fixtureRoot();

    setupIosBundle({ cwd: root, iosTarget: 'Demo' });
    undoIosBundle({ cwd: root, iosTarget: 'Demo' });

    const pbx = readPbx(root);
    expect(pbx).not.toContain('react-native-debug-toolkit: begin debug bundle');
    expect(pbx).toContain('react-native-xcode.sh');
  });

  it('refuses ambiguous app target selection without iosTarget', () => {
    const root = fixtureRoot({
      targets: [
        { id: 'BBB', name: 'Demo', phaseId: 'CCC' },
        { id: 'DDD', name: 'DemoTwo', phaseId: 'EEE' },
      ],
      phases: [
        { id: 'CCC', script: 'set -e\\n../node_modules/react-native/scripts/react-native-xcode.sh\\n' },
        { id: 'EEE', script: 'set -e\\n../node_modules/react-native/scripts/with-environment.sh\\n' },
      ],
    });

    expect(() => setupIosBundle({ cwd: root })).toThrow(/Expected one iOS app target/);
  });

  it('ignores matching phases outside the selected app target', () => {
    const root = fixtureRoot({
      targets: [
        {
          id: 'BBB',
          name: 'FrameworkTarget',
          phaseId: 'CCC',
          productType: 'com.apple.product-type.framework',
        },
        { id: 'DDD', name: 'Demo', phaseId: 'EEE' },
      ],
      phases: [
        { id: 'CCC', script: 'echo not react native\\n' },
        { id: 'EEE', script: 'set -e\\n../node_modules/react-native/scripts/with-environment.sh\\n' },
      ],
    });

    expect(setupIosBundle({ cwd: root, iosTarget: 'Demo' }).changed).toBe(true);
    expect(checkIosBundle({ cwd: root, iosTarget: 'Demo' }).ok).toBe(true);
  });

  it('refuses bundle phases that do not call React Native bundling', () => {
    const root = fixtureRoot({ script: 'echo custom bundle phase\\n' });

    expect(() => setupIosBundle({ cwd: root, iosTarget: 'Demo' })).toThrow(
      /does not call React Native bundling script/,
    );
  });
});
