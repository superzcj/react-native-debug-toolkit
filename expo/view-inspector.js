'use strict';

const {
  withAppBuildGradle,
  withGradleProperties,
  withPodfile,
  withPodfileProperties,
  withProjectBuildGradle,
} = require('expo/config-plugins');

module.exports = function withViewInspector(config) {
  config = withPodfileProperties(config, (mod) => {
    const pods = JSON.parse(mod.modResults['apple.extraPods'] ?? '[]');
    mod.modResults['apple.extraPods'] = JSON.stringify([
      ...pods.filter((pod) => pod.name !== 'FLEX'),
      { name: 'FLEX', version: '5.22.10', configurations: ['Debug'] },
    ]);
    return mod;
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
  config = withProjectBuildGradle(config, (mod) => {
    if (/jitpack\.io/i.test(mod.modResults.contents)) return mod;
    const needle = /(allprojects\s*\{\s*repositories\s*\{)/;
    if (!needle.test(mod.modResults.contents)) throw new Error('Cannot locate Android project repositories');
    mod.modResults.contents = mod.modResults.contents.replace(needle, "$1\n    maven { url 'https://jitpack.io' }");
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('View inspector requires a Groovy app build.gradle');
    if (mod.modResults.contents.includes('com.github.eleme.UETool:uetool:1.3.4')) return mod;
    const needle = /(^dependencies\s*\{)/m;
    if (!needle.test(mod.modResults.contents)) throw new Error('Cannot locate Android app dependencies');
    mod.modResults.contents = mod.modResults.contents.replace(needle, '$1\n    debugImplementation("com.github.eleme.UETool:uetool:1.3.4")\n    debugImplementation("com.github.eleme.UETool:uetool-base:1.3.4")');
    return mod;
  });
  return withGradleProperties(config, (mod) => {
    const property = mod.modResults.find((item) => item.type === 'property' && item.key === 'android.enableJetifier');
    if (property) property.value = 'true';
    else mod.modResults.push({ type: 'property', key: 'android.enableJetifier', value: 'true' });
    return mod;
  });
};
