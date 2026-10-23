import { filterFeatureSnapshot } from '../../ui/panel/filterFeatureSnapshot';
import type { DebugFeature } from '../../types/feature';
import {
  selectChannelLogs,
  channelRawText,
} from '../../features/logChannels/presentation';
import type { LogChannelEntry } from '../../types/logChannel';
const entries: LogChannelEntry[] = [
  {
    id: '1',
    timestamp: 1,
    receivedAt: 2,
    channelTitle: '蓝牙',
    message: 'queued',
    detail: true,
  },
  {
    id: '2',
    timestamp: 3,
    receivedAt: 4,
    channelTitle: '蓝牙',
    message: 'raw evidence',
    summary: '已发送',
    category: 'tx',
    data: { frame: { plaintextPdu: '00 01 ff', ciphertext: 'aa bb cc' } },
  },
];
test('compact list hides process noise without deleting raw records and search can reveal it', () => {
  expect(selectChannelLogs(entries, false, '').map((e) => e.id)).toEqual(['2']);
  expect(selectChannelLogs(entries, false, 'queued').map((e) => e.id)).toEqual([
    '1',
  ]);
  expect(selectChannelLogs(entries, true, '').map((e) => e.id)).toEqual([
    '1',
    '2',
  ]);
  expect(entries).toHaveLength(2);
});
test('raw export includes process records, original message and byte-exact hex, not just summaries', () => {
  expect(JSON.parse(channelRawText(entries))).toEqual(entries);
  expect(channelRawText(entries)).toContain('00 01 ff');
  expect(
    selectChannelLogs(entries, false, 'aa bb cc').map((e) => e.id),
  ).toEqual(['2']);
});

const channel: DebugFeature<LogChannelEntry[]> = {
  name: 'channel.ble', label: '蓝牙', status: { phase: 'ready', issues: [] },
  setup() {}, cleanup() {}, getSnapshot: () => entries,
};

test('panel search preserves the retained count and complete raw export for a channel', () => {
  const snapshot = filterFeatureSnapshot(channel, entries, 'raw evidence', 'all') as LogChannelEntry[];
  expect(snapshot).toHaveLength(2);
  expect(selectChannelLogs(snapshot, false, 'raw evidence').map(entry => entry.id)).toEqual(['2']);
  expect(JSON.parse(channelRawText(snapshot))).toHaveLength(2);
});

test('channel search owns whitespace normalization and raw JSON field matching', () => {
  for (const query of ['  queued  ', 'detail']) {
    const snapshot = filterFeatureSnapshot(channel, entries, query, 'all') as LogChannelEntry[];
    expect(selectChannelLogs(snapshot, false, query).map(entry => entry.id)).toEqual(['1']);
  }
});

test('built-in console search and bad filtering continue to run in the panel', () => {
  const consoleFeature = { ...channel, name: 'console' };
  const logs = [{ level: 'info', message: 'good' }, { level: 'error', message: 'bad' }];
  expect(filterFeatureSnapshot(consoleFeature, logs, 'bad', 'bad')).toEqual([logs[1]]);
});
