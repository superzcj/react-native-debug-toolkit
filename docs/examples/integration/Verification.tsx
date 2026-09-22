import React, { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { debug } from 'react-native-debug-toolkit';

// Enter a reachable, non-mutating endpoint belonging to your app.
export function Verification() {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('Enter your app health/test URL.');
  async function verify() {
    const result = await debug.ready();
    if (result.features.network?.phase !== 'ready' || result.features.console?.phase !== 'ready') {
      setMessage(`Capture not ready: ${result.status}`); return;
    }
    const marker = `integration-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    console.log(marker);
    const target = `${url}${url.includes('?') ? '&' : '?'}toolkit_marker=${encodeURIComponent(marker)}`;
    try {
      const response = await fetch(target);
      setMessage(`${marker}: HTTP ${response.status}`);
    } catch (error) { setMessage(`${marker}: ${String(error)}`); }
  }
  return <View>
    <TextInput value={url} onChangeText={setUrl} placeholder="Your HTTP(S) health/test URL" autoCapitalize="none" />
    <Button title="Generate current-session evidence" disabled={!/^https?:\/\//.test(url)} onPress={() => { void verify(); }} />
    <Text>{message}</Text>
  </View>;
}
