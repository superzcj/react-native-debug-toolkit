describe('platformDetect', () => {
  let isSimulator: () => boolean;

  function loadWithPlatform(
    platform: { OS: string; constants?: Record<string, unknown> },
    nativeModules: Record<string, unknown> = {},
  ) {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      NativeModules: nativeModules,
      Platform: platform,
      AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
      Dimensions: { get: () => ({ width: 390, height: 844 }) },
      StyleSheet: { create: (s: unknown) => s, hairlineWidth: 0.5 },
      Animated: { Value: class {}, ValueXY: class {}, spring: jest.fn(() => ({ start: jest.fn() })), timing: jest.fn(() => ({ start: jest.fn() })), parallel: jest.fn(() => ({ start: jest.fn() })) },
      PanResponder: { create: () => ({ panHandlers: {} }) },
    }));
    const mod = require('../../features/devConnect/platformDetect');
    isSimulator = mod.isSimulator;
  }

  it('detects iOS simulator via Platform.constants.model', () => {
    loadWithPlatform({
      OS: 'ios',
      constants: { forceTouchAvailable: true, systemName: 'iOS', model: 'iPhone Simulator' },
    });
    expect(isSimulator()).toBe(true);
  });

  it('returns false for real iOS device', () => {
    loadWithPlatform({
      OS: 'ios',
      constants: { forceTouchAvailable: true, systemName: 'iOS', model: 'iPhone 16 Pro' },
    });
    expect(isSimulator()).toBe(false);
  });

  it('returns false for iOS when model is missing', () => {
    loadWithPlatform({
      OS: 'ios',
      constants: { forceTouchAvailable: true, systemName: 'iOS' },
    });
    expect(isSimulator()).toBe(false);
  });

  it('returns false when Platform.constants is missing', () => {
    loadWithPlatform({
      OS: 'ios',
    });
    expect(isSimulator()).toBe(false);
  });

  it('detects Android emulator from Model containing sdk', () => {
    loadWithPlatform(
      { OS: 'android', constants: { Model: 'sdk_gphone64_arm64' } },
    );
    expect(isSimulator()).toBe(true);
  });

  it('detects Android emulator from isEmulator flag', () => {
    loadWithPlatform(
      { OS: 'android', constants: { isEmulator: true, Model: 'Pixel 8' } },
    );
    expect(isSimulator()).toBe(true);
  });

  it('returns false for real Android device', () => {
    loadWithPlatform(
      { OS: 'android', constants: { Model: 'Pixel 8' } },
    );
    expect(isSimulator()).toBe(false);
  });

  it('returns false for unknown platform', () => {
    loadWithPlatform({ OS: 'web', constants: {} });
    expect(isSimulator()).toBe(false);
  });
});
