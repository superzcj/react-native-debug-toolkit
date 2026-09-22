import React, { useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';
import { DEMO_API } from './demoApi';

let eventCounter = 0;

function createMarker() {
  const marker = `integration-${Date.now()}-${++eventCounter}`;
  console.log(marker);
  return marker;
}

function ZeroConfigApp() {
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const sendRequest = async () => {
    if (busy) { return; }
    setBusy(true);
    const marker = createMarker();
    try {
      const response = await fetch(`${DEMO_API}/health?integration=${marker}`);
      setResult(`${response.status} · ${marker}`);
    } catch {
      setResult(`API offline · ${marker}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.page}>
      <Text style={styles.title}>零业务配置</Text>
      <Text>点悬浮按钮可查看全部十二类功能。业务数据尚未接入的页面显示空态。</Text>
      <Button title="生成标记日志" onPress={() => setResult(createMarker())} />
      <Button title="发送测试请求" disabled={busy} onPress={sendRequest} />
      <Text accessibilityLiveRegion="polite">{result}</Text>
      <Text>API: {DEMO_API}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 80, gap: 20, backgroundColor: '#F4EEE4' },
  title: { fontSize: 28, fontWeight: '700' },
});

export default withDebugToolkit(ZeroConfigApp);
