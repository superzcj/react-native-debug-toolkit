// Minimal React Native mock for testing pure JS/TS logic
const absoluteFill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 };
const flatten = (style) => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten))
  : style && typeof style === 'object' ? style : undefined;
module.exports = {
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  NativeModules: {},
  Settings: {
    get: jest.fn(),
  },
  I18nManager: {
    getConstants: jest.fn(() => ({})),
  },
  DevSettings: {
    reload: jest.fn(),
  },
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Alert: {
    alert: jest.fn(),
  },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten,
    absoluteFill,
    absoluteFillObject: absoluteFill,
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
