/**
 * @format
 */

import React from 'react';
import { AppRegistry, LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from './App';
import { name as appName } from './app.json';

// Intentional showcase warning stays available in the Toolkit Console.
LogBox.ignoreLogs(['[Checkout] Inventory conflict']);

function RootApp() {
  return <SafeAreaProvider><App /></SafeAreaProvider>;
}

AppRegistry.registerComponent(appName, () => RootApp);
