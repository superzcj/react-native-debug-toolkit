'use strict';

const {
  withAppBuildGradle,
  withBaseMod,
  withGradleProperties,
  withPodfile,
  withProjectBuildGradle,
} = require('expo/config-plugins');

function withoutGradleComments(contents) {
  return contents.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (match, quoted) => quoted || match.replace(/[^\r\n]/g, ' '));
}

module.exports = function withViewInspector(config, { enabled = true, ios = true, android = true } = {}) {
  if (!enabled) return config;

  if (ios) {
    config = withBaseMod(config, {
      platform: 'ios',
      mod: 'podfileProperties',
      async action({ modRequest: { nextMod, ...modRequest }, ...mod }) {
        // Merge after the other property mods, including expo-build-properties.
        const result = await nextMod({ ...mod, modRequest });
        const pods = JSON.parse(result.modResults['apple.extraPods'] ?? '[]');
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
  }
  if (android) {
    config = withProjectBuildGradle(config, (mod) => {
      const contents = mod.modResults.contents;
      const withoutComments = withoutGradleComments(contents);
      const structure = withoutComments.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (match) => ' '.repeat(match.length));
      const match = /allprojects\s*\{\s*repositories\s*\{/.exec(structure);
      if (!match) throw new Error('Cannot locate Android project repositories');
      const start = match.index + match[0].length;
      let end = start;
      let depth = 1;
      while (end < structure.length && depth > 0) {
        if (structure[end] === '{') depth++;
        if (structure[end] === '}') depth--;
        end++;
      }
      if (/https?:\/\/(?:www\.)?jitpack\.io(?:\/|['"])/i.test(withoutComments.slice(start, end))) return mod;
      mod.modResults.contents = `${contents.slice(0, start)}\n    maven { url 'https://jitpack.io' }${contents.slice(start)}`;
      return mod;
    });
    config = withAppBuildGradle(config, (mod) => {
      if (mod.modResults.language !== 'groovy') throw new Error('View inspector requires a Groovy app build.gradle');
      const contents = mod.modResults.contents;
      const code = withoutGradleComments(contents);
      const declared = new Set(Array.from(code.matchAll(/^[ \t]*debugImplementation\s*\(?\s*['"]([^'"]+)['"]/gm), match => match[1]));
      const missing = ['com.github.eleme.UETool:uetool:1.3.4', 'com.github.eleme.UETool:uetool-base:1.3.4']
        .filter(dependency => !declared.has(dependency));
      if (!missing.length) return mod;
      const block = /^dependencies\s*\{/m.exec(code);
      if (!block) throw new Error('Cannot locate Android app dependencies');
      const start = block.index + block[0].length;
      const lines = missing.map(dependency => `\n    debugImplementation("${dependency}")`).join('');
      mod.modResults.contents = contents.slice(0, start) + lines + contents.slice(start);
      return mod;
    });
    config = withGradleProperties(config, (mod) => {
      const property = mod.modResults.find((item) => item.type === 'property' && item.key === 'android.enableJetifier');
      if (property) property.value = 'true';
      else mod.modResults.push({ type: 'property', key: 'android.enableJetifier', value: 'true' });
      return mod;
    });
  }
  return config;
};
