import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { safeStringify } from '../../utils/safeStringify';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { JsonView } from '../../ui/shared/JsonView';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import { fmt } from '../../utils/copyToComputer';
import { LEVEL_COLORS, LEVEL_ICONS } from '../../constants/logLevels';
import type { ConsoleLogEntry, DebugFeatureRenderProps } from '../../types';

export const ConsoleLogTab: React.FC<DebugFeatureRenderProps<ConsoleLogEntry[]>> = React.memo(({ snapshot }) => (
  <LogListScreen
    data={snapshot}
    emptyText="No console logs"
    renderRow={(item) => (
      <View style={s.cardRow}>
        <View style={[s.levelDot, { backgroundColor: LEVEL_COLORS[item.level] ?? '#8E8E93' }]}>
          <Text style={s.levelIcon}>{LEVEL_ICONS[item.level] ?? '●'}</Text>
        </View>
        <View style={s.cardContent}>
          <Text style={s.logMessage} numberOfLines={2}>
            {item.data.map((d) => (typeof d === 'string' ? d : safeStringify(d))).join(' ')}
          </Text>
          <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        </View>
      </View>
    )}
    renderDetailHeader={(item) => (
      <>
        <View style={[s.levelBadge, { backgroundColor: LEVEL_COLORS[item.level] ?? '#8E8E93' }]}>
          <Text style={s.levelBadgeText}>{item.level.toUpperCase()}</Text>
        </View>
        <Text style={s.detailTime}>{new Date(item.timestamp).toLocaleString()}</Text>
      </>
    )}
    renderDetailBody={(item) => (
      <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
        {item.data.map((d, index) => {
          const formatted = typeof d === 'object' && d !== null ? fmt(d) : String(d);
          return (
            <CollapsibleSection
              key={index}
              title={typeof d === 'object' && d !== null ? `Arg ${index + 1} (object)` : `Arg ${index + 1}`}
              initiallyExpanded={index === 0}
            >
              <View style={s.sectionWithCopy}>
                <CopyButton text={formatted} label={`Console Arg ${index + 1}`} />
                {typeof d === 'object' && d !== null ? (
                  <JsonView data={d} maxHeight={250} />
                ) : (
                  <Text style={s.plainText} selectable>{String(d)}</Text>
                )}
              </View>
            </CollapsibleSection>
          );
        })}
      </ScrollView>
    )}
  />
));

const s = StyleSheet.create({
  cardRow: { flexDirection: 'row', padding: 12, alignItems: 'flex-start' },
  levelDot: {
    width: 22, height: 22, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 1,
  },
  levelIcon: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  cardContent: { flex: 1 },
  logMessage: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  time: { fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  levelBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  detailTime: { flex: 1, fontSize: 12, color: Colors.textSecondary, textAlign: 'right' },
  detailBody: { flex: 1 },
  detailBodyContent: { padding: 12 },
  sectionWithCopy: { gap: 8 },
  plainText: { fontFamily: 'Courier', fontSize: 12, color: Colors.text, lineHeight: 18 },
});
