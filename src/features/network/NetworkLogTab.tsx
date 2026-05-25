import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
} from 'react-native';
import { Colors, getMethodColor } from '../../ui/theme/colors';
import { CollapsibleSection } from '../../ui/shared/CollapsibleSection';
import { JsonView } from '../../ui/shared/JsonView';
import { CopyButton } from '../../ui/shared/CopyButton';
import { fmt } from '../../utils/copyToComputer';
import { LogListScreen } from '../../ui/shared/LogListScreen';
import type { DebugFeatureRenderProps, NetworkLogEntry } from '../../types';

const formatSize = (data: unknown): string => {
  if (!data) return '';
  try {
    const len = (typeof data === 'string' ? data : JSON.stringify(data)).length;
    if (len < 1024) return `(${len} B)`;
    if (len < 1024 * 1024) return `(${(len / 1024).toFixed(1)} KB)`;
    return `(${(len / (1024 * 1024)).toFixed(1)} MB)`;
  } catch {
    return '';
  }
};

// Keep in sync with console.html buildCurlCommand()
const buildCurl = (log: NetworkLogEntry): string => {
  const q = (s: string) => s.replace(/'/g, "'\\''");
  let c = `curl -X ${log.request.method} '${q(log.request.url)}'`;
  if (log.request.headers) {
    Object.entries(log.request.headers).forEach(([k, v]) => (c += ` \\\n  -H '${q(k)}: ${q(String(v))}'`));
  }
  if (log.request.body) {
    const bodyStr = typeof log.request.body === 'string' ? log.request.body : JSON.stringify(log.request.body);
    c += ` \\\n  -d '${q(bodyStr)}'`;
  }
  return c;
};

export const NetworkLogTab: React.FC<DebugFeatureRenderProps<NetworkLogEntry[]>> = React.memo(({
  snapshot,
}) => {
  const [search, setSearch] = useState('');
  const data = snapshot;

  const filtered = search
    ? data.filter(
        (l) =>
          l.request.url.toLowerCase().includes(search.toLowerCase()) ||
          l.request.method.toLowerCase().includes(search.toLowerCase()),
      )
    : data;

  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <LogListScreen
      data={sorted}
      reversed={false}
      emptyText="No HTTP requests logged"
      renderListHeader={() => (
        <View style={s.searchContainer}>
          <View style={s.searchBar}>
            <Text style={s.searchIcon}>⌕</Text>
            <TextInput
              style={s.search}
              placeholder="Search URLs..."
              placeholderTextColor={Colors.textLight}
              value={search}
              onChangeText={setSearch}
            />
          </View>
        </View>
      )}
      renderRow={(item) => {
        const ok = !item.error && (!item.response || item.response.status < 400);
        const sc = ok ? Colors.success : Colors.error;
        return (
          <View style={s.cardRow}>
            <View style={[s.statusIndicator, { backgroundColor: sc }]} />
            <View style={s.cardBody}>
              <View style={s.cardMeta}>
                <Text style={[s.methodText, { color: getMethodColor(item.request.method) }]}>
                  {item.request.method}
                </Text>
                <View style={[s.miniPill, { backgroundColor: sc }]}>
                  <Text style={s.miniPillText}>{item.response?.status ?? 'ERR'}</Text>
                </View>
                {item.duration != null && <Text style={s.durationText}>{item.duration}ms</Text>}
              </View>
              <Text style={[s.url, !ok && { color: Colors.error }]} numberOfLines={2}>
                {item.request.url}
              </Text>
              <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
            </View>
          </View>
        );
      }}
      renderDetailHeader={(log) => {
        const statusColor = log.error || (log.response && log.response.status >= 400) ? Colors.error : Colors.success;
        return (
          <View style={s.detailHeaderCenter}>
            <View style={[s.methodBadge, { backgroundColor: getMethodColor(log.request.method) }]}>
              <Text style={s.methodBadgeText}>{log.request.method}</Text>
            </View>
            <View style={[s.statusPill, { backgroundColor: statusColor }]}>
              <Text style={s.statusPillText}>{log.response?.status ?? 'ERR'}</Text>
            </View>
            {log.duration != null && <Text style={s.durationText}>{log.duration}ms</Text>}
          </View>
        );
      }}
      renderDetailBody={(log) => {
        const curlStr = buildCurl(log);
        return (
          <ScrollView style={s.detailBody} contentContainerStyle={s.detailBodyContent}>
            <View style={s.urlCard}>
              <Text style={s.urlText} selectable numberOfLines={3}>{log.request.url}</Text>
              <CopyButton text={log.request.url} label="URL" />
            </View>

            <CollapsibleSection title="Request Body" initiallyExpanded>
              {log.request.body != null ? (
                <View style={s.sectionWithCopy}>
                  <CopyButton text={fmt(log.request.body)} label="Request Body" />
                  <JsonView data={log.request.body} maxHeight={250} />
                </View>
              ) : (
                <Text style={s.emptySection}>No request body</Text>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Request Headers">
              {log.request.headers ? (
                <View style={s.sectionWithCopy}>
                  <CopyButton text={fmt(log.request.headers)} label="Request Headers" />
                  <JsonView data={log.request.headers} maxHeight={200} />
                </View>
              ) : (
                <Text style={s.emptySection}>No headers</Text>
              )}
            </CollapsibleSection>

            <CollapsibleSection title={`Response ${formatSize(log.response?.data)}`} initiallyExpanded>
              {log.error && (
                <View style={s.errorBox}>
                  <Text style={s.errorIcon}>⚠</Text>
                  <Text style={s.errorText}>{log.error}</Text>
                </View>
              )}
              {log.response?.data != null ? (
                <View style={s.sectionWithCopy}>
                  <CopyButton text={fmt(log.response.data)} label="Response Body" />
                  <JsonView data={log.response.data} maxHeight={300} />
                </View>
              ) : (
                <Text style={s.emptySection}>No response body</Text>
              )}
            </CollapsibleSection>

            {log.response?.headers && (
              <CollapsibleSection title="Response Headers">
                <View style={s.sectionWithCopy}>
                  <CopyButton text={fmt(log.response.headers)} label="Response Headers" />
                  <JsonView data={log.response.headers} maxHeight={200} />
                </View>
              </CollapsibleSection>
            )}

            <CollapsibleSection title="cURL">
              <View style={s.sectionWithCopy}>
                <CopyButton text={curlStr} label="cURL" />
                <View style={s.codeBlock}>
                  <Text style={s.codeText} selectable>{curlStr}</Text>
                </View>
              </View>
            </CollapsibleSection>
          </ScrollView>
        );
      }}
    />
  );
});

const s = StyleSheet.create({
  // Search
  searchContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: Colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: { fontSize: 16, color: Colors.textLight, marginRight: 6 },
  search: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    padding: 0,
  },

  // Row
  cardRow: { flexDirection: 'row', padding: 14 },
  statusIndicator: { width: 3, borderRadius: 2, marginRight: 12 },
  cardBody: { flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  methodText: { fontSize: 13, fontWeight: '700' },
  miniPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 },
  miniPillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  durationText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  url: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4, lineHeight: 18 },
  time: { fontSize: 11, color: Colors.textLight },

  // Detail header
  detailHeaderCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  methodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  methodBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  statusPillText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  // Detail body
  detailBody: { flex: 1 },
  detailBodyContent: { padding: 12, paddingBottom: 40 },
  urlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  urlText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  sectionWithCopy: { gap: 8 },
  emptySection: { fontSize: 13, color: Colors.textLight, paddingVertical: 4 },
  errorBox: {
    backgroundColor: 'rgba(255,59,48,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.15)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorIcon: { fontSize: 14, color: Colors.error },
  errorText: { flex: 1, fontSize: 13, color: Colors.error, lineHeight: 18 },
  codeBlock: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 12,
  },
  codeText: { fontFamily: 'Courier', fontSize: 12, color: '#CDD6F4', lineHeight: 18 },
});
