const React = require('react');

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);

function createComponent(name) {
  return React.forwardRef(({ children, ...props }, ref) =>
    React.createElement(name, { ...props, ref }, children),
  );
}

class AnimatedValue {
  constructor(value) {
    this.value = value;
  }

  setValue(value) {
    this.value = value;
  }

  interpolate() {
    return this;
  }
}

class AnimatedValueXY {
  constructor(value) {
    this.x = new AnimatedValue(value?.x ?? 0);
    this.y = new AnimatedValue(value?.y ?? 0);
  }

  setValue(value) {
    this.x.setValue(value.x);
    this.y.setValue(value.y);
  }
}

const animation = () => ({
  start: (callback) => {
    if (callback) callback();
  },
});

module.exports = {
  View: createComponent('View'),
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
  },
  PanResponder: {
    create: () => ({ panHandlers: {} }),
  },
};
