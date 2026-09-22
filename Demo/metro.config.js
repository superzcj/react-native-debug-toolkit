const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// npm's file:.. dependency may be a symlink. Watch that installed package while
// resolving React and native dependencies from the app's own node_modules.
const toolkitRoot = path.dirname(
  require.resolve('react-native-debug-toolkit/package.json'),
);
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  watchFolders: [toolkitRoot],
  resolver: {
    disableHierarchicalLookup: true,
    nodeModulesPaths: [path.join(__dirname, 'node_modules')],
  },
});
