module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['lib/', 'Demo/'],
  overrides: [
    {
      files: ['node/**/*.js', 'bin/**/*.js'],
      env: {
        node: true,
      },
    },
  ],
};
