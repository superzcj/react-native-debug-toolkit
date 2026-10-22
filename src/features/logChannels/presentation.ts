import type { LogChannelEntry } from '../../types/logChannel';

export function selectChannelLogs(
  entries: readonly LogChannelEntry[],
  includeDetail: boolean,
  query: string,
): LogChannelEntry[] {
  const text = query.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (includeDetail || text || !entry.detail) &&
      (!text || JSON.stringify(entry).toLowerCase().includes(text)),
  );
}
/** Export receives the retained store, not the compact/filtered screen. */
export const channelRawText = (entries: readonly LogChannelEntry[]): string =>
  JSON.stringify(entries, null, 2);
