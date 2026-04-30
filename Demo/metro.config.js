const path = require('path');
const fs = require('fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const root = path.resolve(__dirname, '..');
const demoNodeModules = path.resolve(__dirname, 'node_modules');
const toolkitSrc = path.resolve(root, 'src');

/**
 * Collect ALL module names from Demo's node_modules, including scoped packages.
 * This ensures Metro never falls through to the root project's node_modules.
 */
function collectModuleNames(nodeModulesDir) {
  const modules = {};
  const entries = fs.readdirSync(nodeModulesDir);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const fullPath = path.join(nodeModulesDir, entry);
    if (entry.startsWith('@')) {
      // Scoped package: @scope/name
      if (fs.statSync(fullPath).isDirectory()) {
        const scoped = fs.readdirSync(fullPath);
        for (const pkg of scoped) {
          if (pkg.startsWith('.')) continue;
          modules[`${entry}/${pkg}`] = path.join(fullPath, pkg);
        }
      }
    } else if (fs.statSync(fullPath).isDirectory()) {
      modules[entry] = fullPath;
    }
  }
  return modules;
}

const demoModules = collectModuleNames(demoNodeModules);

// Resolve toolkit to its source entry point
demoModules['react-native-debug-toolkit'] = path.resolve(toolkitSrc, 'index.ts');

const config = {
  watchFolders: [toolkitSrc],
  resolver: {
    extraNodeModules: demoModules,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
