/**
 * @format
 */

import React from 'react';
import { AppRegistry, Button, LogBox, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ShowcaseApp from './App';
import ZeroConfigApp from './ZeroConfigApp';
import { name as appName } from './app.json';

// Intentional showcase warning stays available in the Toolkit Console.
LogBox.ignoreLogs(['[Checkout] Inventory conflict']);

export function RootApp() {
  const [mode, setMode] = React.useState('zero');
  return <SafeAreaProvider>
    <View style={styles.root}>
      <View style={styles.modes}>
        <Button title="零配置" disabled={mode === 'zero'} onPress={() => setMode('zero')} />
        <Button title="完整 Showcase" disabled={mode === 'showcase'} onPress={() => setMode('showcase')} />
      </View>
      {mode === 'zero' ? <ZeroConfigApp /> : <ShowcaseApp />}
    </View>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  modes: { flexDirection: 'row', justifyContent: 'center', paddingTop: 44, backgroundColor: '#F4EEE4' },
});

AppRegistry.registerComponent(appName, () => RootApp);
