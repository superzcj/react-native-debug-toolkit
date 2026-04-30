import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { safeStringify } from '../../utils/safeStringify';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { JsonView } from '../../ui/shared/JsonView';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import type { DebugFeatureRenderProps, TrackLogEntry } from '../../types';

export const TrackLogTab: React.FC<DebugFeatureRenderProps<TrackLogEntry[]>> = React.memo(({ snapshot }) => (
  <LogListScreen
    data={snapshot}
    emptyText="No track events"
    renderRow={(item) => (
      <View style={s.cardRow}>
        <View style={s.eventIcon}><Text style={s.eventIconText}>●</Text></View>
        <View style={s.cardContent}>
          <View style={s.cardHeader}>
            <Text style={s.eventName}>{item.eventName}</Text>
            <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
          </View>
          <View style={s.previewRow}>
            {Object.entries(item)
              .filter(([k]) => k !== 'id' && k !== 'eventName' && k !== 'timestamp')
              .slice(0, 2)
              .map(([key, value]) => (
                <View key={key} style={s.previewChip}>
                  <Text style={s.previewText} numberOfLines={1}>
                    <Text style={s.previewKey}>{key}</Text> {String(value ?? '').slice(0, 25)}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      </View>
    )}
    renderDetailHeader={(item) => (
      <View style={s.eventBadge}><Text style={s.eventBadgeText}>{item.eventName}</Text></View>
    )}
    renderDetailBody={(item) => {
      const extraProps = Object.entries(item).filter(
        ([k, v]) => k !== 'id' && k !== 'eventName' && k !== 'timestamp' && v !== undefined && v !== null,
      );
      return (
        <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
          <CollapsibleSection title="Properties" initiallyExpanded>
            <View style={s.sectionWithCopy}>
              <CopyButton text={safeStringify(Object.fromEntries(extraProps), 2)} label="Track Properties" />
              <View style={s.propsGrid}>
                {extraProps.map(([key, value]) => (
                  <View key={key} style={s.propRow}>
                    <Text style={s.propKey}>{key}</Text>
                    <Text style={s.propValue} selectable>
                      {typeof value === 'object' ? safeStringify(value) : String(value ?? '')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </CollapsibleSection>
          <CollapsibleSection title="Full Event Data">
            <View style={s.sectionWithCopy}>
              <CopyButton text={safeStringify(item, 2)} label="Track Event" />
              <JsonView data={item} maxHeight={300} />
            </View>
          </CollapsibleSection>
          <View style={s.timingCard}>
            <Text style={s.timingLabel}>Time</Text>
            <Text style={s.timingValue}>{new Date(item.timestamp).toLocaleString()}</Text>
          </View>
        </ScrollView>
      );
    }}
  />
));

const s = StyleSheet.create({
  cardRow: { flexDirection: 'row', padding: 14, alignItems: 'flex-start' },
  eventIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(175,82,222,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 1,
  },
  eventIconText: { color: Colors.purple, fontSize: 10 },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  eventName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  time: { fontSize: 12, color: Colors.textSecondary },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  previewChip: { backgroundColor: Colors.background, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  previewText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  previewKey: { fontWeight: '600', color: Colors.text },
  eventBadge: { backgroundColor: Colors.purple, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  eventBadgeText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  detailBody: { flex: 1 },
  detailBodyContent: { padding: 12, paddingBottom: 40 },
  sectionWithCopy: { gap: 8 },
  propsGrid: { gap: 12 },
  propRow: {},
  propKey: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 3 },
  propValue: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  timingCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4,
  },
  timingLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  timingValue: { fontSize: 13, color: Colors.text },
});
