import React from 'react';
import {
  View,
  Text,
  StyleSheet,
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
  const sorted = [...snapshot].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <LogListScreen
      data={sorted}
      reversed={false}
      emptyText="No HTTP requests logged"
      renderRow={(item) => {
        const ok = !item.error && (!item.response || item.response.status < 400);
        const statusColor = ok ? Colors.success : Colors.error;
        const urlParts = formatUrlParts(item.request.url);

        return (
          <View style={s.cardRow}>
            <View style={[s.statusIndicator, { backgroundColor: statusColor }]} />
            <View style={s.cardBody}>
              <View style={s.primaryRow}>
                <View style={[s.methodChip, { backgroundColor: getMethodColor(item.request.method) }]}>
                  <Text style={s.methodChipText}>{item.request.method}</Text>
                </View>
                <Text style={[s.pathText, !ok && { color: Colors.error }]} numberOfLines={2}>
                  {urlParts.path}
                </Text>
              </View>
              <View style={s.metaRow}>
                <View style={[s.statusChip, { backgroundColor: statusColor }]}>
                  <Text style={s.statusChipText}>{item.response?.status ?? 'ERR'}</Text>
                </View>
                {!!urlParts.host && <Text style={[s.metaText, s.hostText]} numberOfLines={1}>{urlParts.host}</Text>}
                <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
              </View>
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

function formatUrlParts(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.host,
      path: parsed.pathname + parsed.search,
    };
  } catch {
    return { host: '', path: url };
  }
}

const s = StyleSheet.create({
  cardRow: { flexDirection: 'row', padding: 12 },
  statusIndicator: { width: 3, borderRadius: 2, marginRight: 10 },
  cardBody: { flex: 1, gap: 7 },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  methodChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  methodChipText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  pathText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  statusChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusChipText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  metaText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  hostText: { flex: 1 },
  time: { fontSize: 11, color: Colors.textLight },
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
  durationText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
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
