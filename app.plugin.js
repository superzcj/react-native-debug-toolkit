'use strict';

function markTestConfig(config) {
  config.extra = config.extra || {};
  config.extra.reactNativeDebugToolkit = {
    ...(config.extra.reactNativeDebugToolkit || {}),
    embedBundle: true,
  };
  return config;
}

function loadConfigPlugins() {
  try {
    return require('@expo/config-plugins');
  } catch {
    throw new Error(
      'react-native-debug-toolkit/dev-client requires @expo/config-plugins during Expo prebuild.',
    );
  }
}

function withDebugToolkitDevClient(config, props = {}) {
  if (!props.embedBundle) {
    return config;
  }

  if (props._testOnly) {
    return markTestConfig(config);
  }

  const { withDangerousMod } = loadConfigPlugins();
  const { setupIosBundle } = require('./scripts/bundle/ios');
  const { setupAndroidBundle } = require('./scripts/bundle/android');

  config = withDangerousMod(config, ['ios', async (modConfig) => {
    setupIosBundle({
      cwd: modConfig.modRequest.projectRoot,
      iosTarget: props.iosTarget,
    });
    return modConfig;
  }]);

  config = withDangerousMod(config, ['android', async (modConfig) => {
    setupAndroidBundle({ cwd: modConfig.modRequest.projectRoot });
    return modConfig;
  }]);

  return config;
}

module.exports = withDebugToolkitDevClient;
