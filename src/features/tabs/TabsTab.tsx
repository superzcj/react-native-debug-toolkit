import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { DebugFeatureRenderProps } from '../../types/feature';
import type { TabsFeature, TabsSnapshot } from './index';
import { Colors } from '../../ui/theme/colors';

class PageBoundary extends React.Component<{ children: React.ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'Custom page failed.' };
  }
  render() { return this.state.error ? <Text accessibilityRole="alert">{this.state.error}</Text> : this.props.children; }
}

export function TabsTab({ snapshot, feature }: DebugFeatureRenderProps<TabsSnapshot>) {
  const [selected, setSelected] = useState<string>();
  if (snapshot.error) { return <Text accessibilityRole="alert">{snapshot.error}</Text>; }
  if (!snapshot.items.length) { return <View style={styles.container}>
    <Text style={styles.text}>No custom pages</Text>
    <Text style={styles.text}>Add components to tabs.items to display your custom pages.</Text>
  </View>; }
  const item = snapshot.items.find(candidate => candidate.id === selected) ?? snapshot.items[0]!;
  const Component = item.component;
  return <View style={styles.container}>
    <View style={styles.tabs}>{snapshot.items.map(tab => <TouchableOpacity
      key={tab.id} testID={`custom-tab-${tab.id}`} onPress={() => setSelected(tab.id)}
      accessibilityRole="tab" accessibilityState={{ selected: tab.id === item.id }} style={styles.tab}
    ><Text style={styles.text}>{tab.title}</Text>{tab.badge && <Text style={{ color: tab.badge.color }}>{tab.badge.label}</Text>}</TouchableOpacity>)}</View>
    {item.error ? <Text accessibilityRole="alert" style={styles.text}>{item.error}</Text> : <>
      {item.canClear && <TouchableOpacity onPress={() => (feature as TabsFeature).actions.clear(item.id)}><Text style={styles.text}>Clear</Text></TouchableOpacity>}
      <PageBoundary key={item.id}>{item.hasSource ? <Component snapshot={item.snapshot} /> : <Component />}</PageBoundary>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: Colors.background },
  tabs: { flexDirection: 'row', flexWrap: 'wrap' },
  tab: { padding: 8 },
  text: { color: Colors.text },
});
