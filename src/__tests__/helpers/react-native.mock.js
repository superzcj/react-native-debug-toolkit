// Minimal React Native mock for testing pure JS/TS logic
module.exports = {
  NativeModules: {},
  Platform: { OS: 'ios' },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
  },
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 0.5,
  },
  Animated: {
    Value: class Value {},
    ValueXY: class ValueXY {},
    spring: jest.fn(() => ({ start: jest.fn() })),
    timing: jest.fn(() => ({ start: jest.fn() })),
    parallel: jest.fn(() => ({ start: jest.fn() })),
  },
  PanResponder: {
    create: () => ({ panHandlers: {} }),
  },
};
