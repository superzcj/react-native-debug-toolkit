const React = require('react');

exports.SafeAreaView = ({ children, ...props }) =>
  React.createElement('SafeAreaView', props, children);
