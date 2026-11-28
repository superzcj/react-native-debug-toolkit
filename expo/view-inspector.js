'use strict';

let expoConfigPlugins;
try {
  expoConfigPlugins = require('expo/config-plugins');
} catch {
  expoConfigPlugins = require(require.resolve('expo/config-plugins', { paths: [process.cwd()] }));
}

const {
  withBaseMod,
  withPodfile,
} = expoConfigPlugins;

// Android uses the built-in AndroidX inspector via autolinking; this plugin only configures iOS FLEX.
// Legacy `android` option values are accepted and ignored for backward compatibility.
module.exports = function withViewInspector(config, { enabled = true, ios = true } = {}) {
  if (!enabled || !ios) return config;

  config = withBaseMod(config, {
    platform: 'ios',
    mod: 'podfileProperties',
    async action({ modRequest: { nextMod, ...modRequest }, ...mod }) {
      // Merge after the other property mods, including expo-build-properties.
      const result = await nextMod({ ...mod, modRequest });
      const pods = JSON.parse(result.modResults['apple.extraPods'] || '[]');
      result.modResults['apple.extraPods'] = JSON.stringify([
        ...pods.filter((pod) => pod.name !== 'FLEX'),
        { name: 'FLEX', version: '5.22.10', configurations: ['Debug'] },
      ]);
      return result;
    },
  });
  config = withPodfile(config, (mod) => {
    const marker = '# react-native-debug-toolkit FLEX snapshot patch';
    if (mod.modResults.contents.includes(marker)) return mod;
    const needle = /^([ \t]*post_install do \|installer\|[ \t]*)$/m;
    if (!needle.test(mod.modResults.contents)) throw new Error('Cannot locate the iOS Podfile post_install block');
    const patch = [
      marker,
      'require File.join(File.dirname(`node --print "require.resolve(\'react-native-debug-toolkit/package.json\')"`.strip), \'ios\', \'patch_flex\')',
      'patch_debug_toolkit_flex(installer)',
    ].map((line) => `    ${line}`).join('\n');
    mod.modResults.contents = mod.modResults.contents.replace(needle, `$1\n${patch}`);
    return mod;
  });

  return config;
};
