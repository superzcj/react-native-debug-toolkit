jest.mock('expo/config-plugins', () => {
  const hook = name => (config, callback) => {
    config.hooks[name] = callback;
    return config;
  };
  return {
    withBaseMod: (config, { action }) => {
      config.hooks.podfileProperties = mod => action({
        ...mod,
        modRequest: { nextMod: config.nextPodfilePropertiesMod ?? (value => value) },
      });
      return config;
    },
    withPodfile: hook('podfile'),
    withProjectBuildGradle: hook('projectGradle'),
    withAppBuildGradle: hook('appGradle'),
    withGradleProperties: hook('gradleProperties'),
  };
}, { virtual: true });

const withViewInspector = require('../../../expo/view-inspector');

function fixture() {
  return {
    hooks: {},
    mods: {
      podfileProperties: { modResults: { 'apple.extraPods': '[{"name":"Other"}]' } },
      podfile: { modResults: { contents: 'post_install do |installer|\nend\n' } },
      projectGradle: { modResults: { contents: 'allprojects { repositories {\n} }' } },
      appGradle: { modResults: { language: 'groovy', contents: 'dependencies {\n}\n' } },
      gradleProperties: { modResults: [{ type: 'property', key: 'android.enableJetifier', value: 'false' }] },
    },
  };
}

async function apply(config) {
  for (const [name, callback] of Object.entries(config.hooks)) {
    await callback(config.mods[name]);
  }
}

test.each([
  [undefined, true, false],
  [{}, true, false],
  [{ ios: false }, false, false],
  [{ android: true }, true, true],
  [{ enabled: true, ios: true, android: true }, true, true],
  [{ enabled: true, ios: false, android: true }, false, true],
  [{ enabled: true, ios: true, android: false }, true, false],
  [{ enabled: true, ios: false, android: false }, false, false],
  [{ enabled: false, ios: true, android: true }, false, false],
  [{ enabled: false, ios: false, android: true }, false, false],
  [{ enabled: false, ios: true, android: false }, false, false],
  [{ enabled: false, ios: false, android: false }, false, false],
])('applies options %j only to selected platforms', async (options, ios, android) => {
  const config = fixture();
  const before = JSON.parse(JSON.stringify(config.mods));
  expect(withViewInspector(config, options)).toBe(config);
  await apply(config);
  if (ios) {
    expect(JSON.parse(config.mods.podfileProperties.modResults['apple.extraPods'])).toEqual([
      { name: 'Other' },
      { name: 'FLEX', version: '5.22.10', configurations: ['Debug'] },
    ]);
    expect(config.mods.podfile.modResults.contents).toContain('patch_debug_toolkit_flex(installer)');
  } else {
    expect(config.mods.podfileProperties).toEqual(before.podfileProperties);
    expect(config.mods.podfile).toEqual(before.podfile);
  }
  if (android) {
    expect(config.mods.projectGradle.modResults.contents).toContain('jitpack.io');
    expect(config.mods.appGradle.modResults.contents).toContain('debugImplementation("com.github.eleme.UETool:uetool:1.3.4")');
    expect(config.mods.gradleProperties.modResults[0].value).toBe('true');
  } else {
    expect(config.mods.projectGradle).toEqual(before.projectGradle);
    expect(config.mods.appGradle).toEqual(before.appGradle);
    expect(config.mods.gradleProperties).toEqual(before.gradleProperties);
  }
});

test('explicitly enabling both platforms is idempotent across prebuilds', async () => {
  const config = fixture();
  withViewInspector(config, { android: true });
  await apply(config);
  const once = JSON.stringify(config.mods);
  await apply(config);
  expect(JSON.stringify(config.mods)).toBe(once);
});

test.each(['uetool', 'uetool-base'])('completes a partial Android installation containing %s', async existing => {
  const config = fixture();
  const gradle = config.mods.appGradle.modResults;
  const group = 'com.github.eleme.UETool';
  gradle.contents = `dependencies {\n    debugImplementation '${group}:${existing}:1.3.4'\n}\n`;
  withViewInspector(config, { ios: false, android: true });
  await apply(config);
  for (const artifact of ['uetool', 'uetool-base']) {
    expect(gradle.contents.split(`${group}:${artifact}:1.3.4`)).toHaveLength(2);
  }
  const once = gradle.contents;
  await apply(config);
  expect(gradle.contents).toBe(once);
});

test('commented Android dependencies do not satisfy the debug build', async () => {
  const config = fixture();
  const gradle = config.mods.appGradle.modResults;
  gradle.contents = 'dependencies {\n/*\n    debugImplementation("com.github.eleme.UETool:uetool:1.3.4")\n*/\n}\n';
  withViewInspector(config, { ios: false, android: true });
  await apply(config);
  expect(gradle.contents.split('/*')[0]).toContain('debugImplementation("com.github.eleme.UETool:uetool:1.3.4")');
});

test('retains other pods when another property mod overwrites the pod list', async () => {
  const config = fixture();
  config.nextPodfilePropertiesMod = mod => {
    mod.modResults['apple.extraPods'] = JSON.stringify([{ name: 'Other' }]);
    return mod;
  };
  withViewInspector(config, { android: false });
  await apply(config);
  expect(JSON.parse(config.mods.podfileProperties.modResults['apple.extraPods'])).toEqual([
    { name: 'Other' },
    { name: 'FLEX', version: '5.22.10', configurations: ['Debug'] },
  ]);
});

test.each([
  "buildscript { repositories { maven { url 'https://jitpack.io' } } }\nallprojects { repositories { google() } }",
  "// maven { url 'https://jitpack.io' }\nallprojects { repositories { google() } }",
  "allprojects { repositories { /* maven { url 'https://jitpack.io' } */ google() } }",
])('adds JitPack to application repositories when it is present elsewhere', async contents => {
  const config = fixture();
  config.mods.projectGradle.modResults.contents = contents;
  withViewInspector(config, { ios: false, android: true });
  await apply(config);
  expect(config.mods.projectGradle.modResults.contents).toContain(
    "allprojects { repositories {\n    maven { url 'https://jitpack.io' }",
  );
  const once = config.mods.projectGradle.modResults.contents;
  await apply(config);
  expect(config.mods.projectGradle.modResults.contents).toBe(once);
});

test('reuses JitPack in the application repositories', async () => {
  const config = fixture();
  const contents = "allprojects { repositories { google()\n    maven { url 'https://www.jitpack.io' }\n} }";
  config.mods.projectGradle.modResults.contents = contents;
  withViewInspector(config, { ios: false, android: true });
  await apply(config);
  expect(config.mods.projectGradle.modResults.contents).toBe(contents);
});
