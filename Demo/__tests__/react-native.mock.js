const React = require('react');

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
const backHandlers = new Set();

function createComponent(name) {
  return React.forwardRef(({ children, ...props }, ref) =>
    React.createElement(name, { ...props, ref },
      name === 'Pressable' && typeof children === 'function' ? children({ pressed: false }) : children),
  );
}

class AnimatedValue {
  constructor(value) {
    this.value = value;
  }

  setValue(value) {
    this.value = value;
  }

  stopAnimation(callback) { if (callback) callback(this.value); }

  interpolate() {
    return this;
  }
}

class AnimatedValueXY {
  constructor(value) {
    this.x = new AnimatedValue(value?.x ?? 0);
    this.y = new AnimatedValue(value?.y ?? 0);
  }

  stopAnimation(callback) { if (callback) callback({ x: this.x.value, y: this.y.value }); }

  setValue(value) {
    this.x.setValue(value.x);
    this.y.setValue(value.y);
  }
}

const animation = () => ({
  stop: () => {},
  start: (callback) => {
    if (callback) callback({ finished: true });
  },
});

module.exports = {
  View: createComponent('View'),
  SafeAreaView: createComponent('SafeAreaView'),
  ActivityIndicator: createComponent('ActivityIndicator'),
  Button: createComponent('Button'),
  KeyboardAvoidingView: createComponent('KeyboardAvoidingView'),
  Text: createComponent('Text'),
  ScrollView: createComponent('ScrollView'),
  StatusBar: createComponent('StatusBar'),
  TouchableOpacity: createComponent('TouchableOpacity'),
  Pressable: createComponent('Pressable'),
  TextInput: createComponent('TextInput'),
  Modal: createComponent('Modal'),
  Switch: createComponent('Switch'),
  FlatList: ({ data = [], renderItem, keyExtractor }) =>
    React.createElement(
      'FlatList',
      null,
      data.map((item, index) =>
        React.cloneElement(renderItem({ item, index }), {
          key: keyExtractor ? keyExtractor(item, index) : index,
        }),
      ),
    ),
  useColorScheme: () => 'light',
  NativeModules: {},
  AppRegistry: { registerComponent: jest.fn() },
  LogBox: { ignoreLogs: jest.fn() },
  DevSettings: {
    reload: jest.fn(),
  },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  TurboModuleRegistry: { get: () => null },
  Platform: {
    OS: 'ios',
    select: (value) => value.ios ?? value.default,
  },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
  },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFillObject: {},
  },
  Animated: {
    Value: AnimatedValue,
    ValueXY: AnimatedValueXY,
    spring: jest.fn(animation),
    timing: jest.fn(animation),
    parallel: jest.fn(animation),
    View: createComponent('AnimatedView'),
    Text: createComponent('AnimatedText'),
  },
  Easing: {
    out: (easing) => easing,
    cubic: { factory: () => ((t) => t) },
    bezier: () => ((t) => t),
    linear: (t) => t,
    ease: (t) => t,
  },
  PanResponder: {
    create: (config) => {
      const handlers = { ...config };
      global.__lastPanResponder = handlers;
      return { panHandlers: handlers };
    },
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(async () => false),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  BackHandler: {
    addEventListener: jest.fn((_event, handler) => {
      backHandlers.add(handler);
      return { remove: jest.fn(() => backHandlers.delete(handler)) };
    }),
    __emitBack: () => Array.from(backHandlers).some((handler) => handler()),
  },
  Linking: {
    openSettings: jest.fn(async () => undefined),
  },
};
