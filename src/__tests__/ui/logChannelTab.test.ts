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
