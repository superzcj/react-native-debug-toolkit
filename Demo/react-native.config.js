/**
 * The Toolkit detects RNCClipboard dynamically, so the Shared Hub Demo does
 * not need this optional native module. Version 1.16.x cannot compile with
 * this Demo's React Native 0.85 new-architecture build; exclude it rather
 * than making an unrelated dependency part of the Hub acceptance path.
 */
module.exports = {
  dependencies: {
    '@react-native-clipboard/clipboard': {
      platforms: {
        android: null,
      },
    },
  },
};
