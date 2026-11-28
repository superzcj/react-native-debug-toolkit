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
  };
}, { virtual: true });

const withViewInspector = require('../../../expo/view-inspector');

function fixture() {
  return {
    hooks: {},
    mods: {
      podfileProperties: { modResults: { 'apple.extraPods': '[{"name":"Other"}]' } },
      podfile: { modResults: { contents: 'post_install do |installer|\nend\n' } },
    },
  };
}

async function apply(config) {
  for (const [name, callback] of Object.entries(config.hooks)) {
    await callback(config.mods[name]);
  }
}

test.each([
  [undefined, true],
  [{}, true],
  [{ ios: false }, false],
  [{ android: true }, true],
  [{ enabled: true, ios: true, android: true }, true],
  [{ enabled: true, ios: false, android: true }, false],
  [{ enabled: true, ios: true, android: false }, true],
  [{ enabled: true, ios: false, android: false }, false],
  [{ enabled: false, ios: true, android: true }, false],
  [{ enabled: false, ios: false, android: true }, false],
  [{ enabled: false, ios: true, android: false }, false],
  [{ enabled: false, ios: false, android: false }, false],
])('applies options %j to iOS FLEX only without touching Android Gradle', async (options, ios) => {
  const config = fixture();
  const before = JSON.parse(JSON.stringify(config.mods));
  expect(withViewInspector(config, options)).toBe(config);
  await apply(config);
  expect(Object.keys(config.hooks).sort()).toEqual(ios ? ['podfile', 'podfileProperties'] : []);
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
});

test('applying the plugin repeatedly is idempotent across prebuilds', async () => {
  const config = fixture();
  withViewInspector(config);
  await apply(config);
  const once = JSON.stringify(config.mods);
  await apply(config);
  expect(JSON.stringify(config.mods)).toBe(once);
});

test('retains other pods when another property mod overwrites the pod list', async () => {
  const config = fixture();
  config.nextPodfilePropertiesMod = mod => {
    mod.modResults['apple.extraPods'] = JSON.stringify([{ name: 'Other' }]);
    return mod;
  };
  withViewInspector(config);
  await apply(config);
  expect(JSON.parse(config.mods.podfileProperties.modResults['apple.extraPods'])).toEqual([
    { name: 'Other' },
    { name: 'FLEX', version: '5.22.10', configurations: ['Debug'] },
  ]);
});

test('handles empty string apple.extraPods without failing JSON parsing', async () => {
  const config = fixture();
  config.mods.podfileProperties.modResults['apple.extraPods'] = '';
  withViewInspector(config);
  await apply(config);
  expect(JSON.parse(config.mods.podfileProperties.modResults['apple.extraPods'])).toEqual([
    { name: 'FLEX', version: '5.22.10', configurations: ['Debug'] },
  ]);
});
