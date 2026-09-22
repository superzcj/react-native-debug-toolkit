const React = require('react');

exports.SafeAreaView = ({ children, ...props }) =>
  React.createElement('SafeAreaView', props, children);

exports.SafeAreaProvider = ({ children }) =>
  React.createElement(React.Fragment, null, children);
