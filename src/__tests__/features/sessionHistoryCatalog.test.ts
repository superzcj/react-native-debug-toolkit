import {
  countSessionLogs,
  flattenSessionLogs,
  SESSION_HISTORY_LOG_KEYS,
} from '../../features/sessionHistory/sessionLogCatalog';

describe('session history log catalog', () => {
  it('counts native logs with other persisted session logs', () => {
    expect(countSessionLogs({
      console_logs: 1,
      network_logs: 2,
      native_logs: 3,
      track_logs: 4,
    })).toBe(10);
  });

  it('flattens all persisted session log types including native logs', () => {
    const logs = {
      console_logs: [{ id: 'c1', timestamp: 10, level: 'log' }],
      network_logs: [{ id: 'n1', timestamp: 20, request: { url: '/api' } }],
      native_logs: [{ id: 'native-1', timestamp: 30, message: 'boot' }],
      track_logs: [{ id: 't1', timestamp: 40, eventName: 'open' }],
    };

    expect(SESSION_HISTORY_LOG_KEYS).toEqual([
      'console_logs',
      'network_logs',
      'native_logs',
      'track_logs',
    ]);
    expect(flattenSessionLogs(logs, 'all').map((entry) => entry.type)).toEqual([
      'track_logs',
      'native_logs',
      'network_logs',
      'console_logs',
    ]);
  });
});
