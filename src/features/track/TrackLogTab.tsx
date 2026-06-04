import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
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
  cardRow: { flexDirection: 'row', padding: Spacing.MD, alignItems: 'flex-start' },
  eventIcon: {
    width: 24,
    height: 24,
    borderRadius: Radius.SM,
    backgroundColor: Colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.MD,
    marginTop: 1,
  },
  eventIconText: { color: Colors.primary, fontSize: FontSize.XXS },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.XXS },
  eventName: { fontSize: FontSize.MD, fontWeight: FontWeight.semibold, color: Colors.text },
  time: { fontSize: FontSize.XS, color: Colors.textSecondary },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.XXS },
  previewChip: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.XS, paddingHorizontal: Spacing.SM, paddingVertical: 2 },
  previewText: { fontSize: FontSize.XS, color: Colors.textSecondary, lineHeight: 16 },
  previewKey: { fontWeight: FontWeight.semibold, color: Colors.text },
  eventBadge: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.MD, paddingVertical: Spacing.XXS, borderRadius: Radius.SM },
  eventBadgeText: { color: Colors.textInverse, fontSize: FontSize.MD, fontWeight: FontWeight.bold },
  detailBody: { flex: 1 },
  detailBodyContent: { padding: Spacing.MD, paddingBottom: 40 },
  sectionWithCopy: { gap: Spacing.SM },
  propsGrid: { gap: Spacing.MD },
  propRow: {},
  propKey: { fontSize: FontSize.SM, fontWeight: FontWeight.semibold, color: Colors.textSecondary, marginBottom: 2 },
  propValue: { fontSize: FontSize.MD, color: Colors.text, lineHeight: 20 },
  timingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    padding: Spacing.MD,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.XXS,
  },
  timingLabel: { fontSize: FontSize.SM, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  timingValue: { fontSize: FontSize.SM, color: Colors.text },
});
