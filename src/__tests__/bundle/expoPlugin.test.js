const plugin = require('../../../app.plugin');
const devClientPlugin = require('../../../dev-client');

describe('Expo config plugin', () => {
  it('exports a function', () => {
    expect(typeof plugin).toBe('function');
  });

  it('exports the same plugin from the dev-client subpath', () => {
    expect(devClientPlugin).toBe(plugin);
  });

  it('leaves config unchanged when embedBundle is false', () => {
    const config = {
      name: 'Example',
      extra: {
        reactNativeDebugToolkit: {
          existing: true,
        },
      },
    };

    const result = plugin(config, { embedBundle: false });

    expect(result).toBe(config);
    expect(config).toEqual({
      name: 'Example',
      extra: {
        reactNativeDebugToolkit: {
          existing: true,
        },
      },
    });
  });

  it('marks debug bundle embedding in test mode while preserving existing fields', () => {
    const config = {
      extra: {
        reactNativeDebugToolkit: {
          existing: 'kept',
        },
      },
    };

    const result = plugin(config, { embedBundle: true, _testOnly: true });

    expect(result).toBe(config);
    expect(config.extra.reactNativeDebugToolkit).toEqual({
      existing: 'kept',
      embedBundle: true,
    });
  });

  it('throws a helpful error when Expo config plugins are unavailable', () => {
    jest.resetModules();
    jest.doMock('@expo/config-plugins', () => {
      throw new Error('missing');
    }, { virtual: true });
    const pluginWithoutExpo = require('../../../app.plugin');

    expect(() => pluginWithoutExpo({}, { embedBundle: true })).toThrow(
      /@expo\/config-plugins.*Expo prebuild/,
    );

    jest.dontMock('@expo/config-plugins');
  });
});
