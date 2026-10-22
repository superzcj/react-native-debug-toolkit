'use strict';
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { validateDeviceMetadata } = require('../src/protocol/validation');
const html = fs.readFileSync(
  path.join(__dirname, '../src/console/console.html'),
  'utf8',
);
function fn(name, end, context = {}) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) {throw Error(`missing ${name}`);}
  return vm.runInNewContext(
    '(' +
      html.slice(start, html.indexOf(`function ${end}(`, start)).trim() +
      ')',
    context,
  );
}
test('metadata admits channel labels for empty tabs but rejects malformed or unbounded descriptors', () => {
  expect(
    validateDeviceMetadata({
      platform: 'ios',
      logChannels: [{ id: 'channel.ble', title: '蓝牙' }],
    }),
  ).toBeNull();
  expect(
    validateDeviceMetadata({
      platform: 'ios',
      logChannels: [{ id: 'channel.bad/key', title: 'x' }],
    }),
  ).not.toBeNull();
  expect(
    validateDeviceMetadata({
      platform: 'ios',
      logChannels: [{ id: 'channel.ble', title: 'x'.repeat(1000) }],
    }),
  ).not.toBeNull();
});
test('Hub compact filtering keeps process entries available to search without mutating storage', () => {
  const events = [
    {
      sequence: 1,
      timestamp: 1,
      type: 'channel.ble',
      data: { message: 'queued', detail: true },
    },
    {
      sequence: 2,
      timestamp: 2,
      type: 'channel.ble',
      data: {
        message: 'raw',
        summary: '已发送',
        attachments: [{ label: '明文', value: '00 ff' }],
      },
    },
  ];
  const state = {
    events,
    selectedType: 'channel.ble',
    includeDetail: false,
    failedOnly: false,
    search: '',
  };
  const filter = fn('filteredEvents', 'renderLogEntry', {
    state,
    isFailed: () => false,
    isChannelType: (t) => t.startsWith('channel.'),
    summary: (e) => e.data.summary || e.data.message,
    stringify: JSON.stringify,
  });
  expect(filter().map((e) => e.sequence)).toEqual([2]);
  state.search = 'queued';
  expect(filter().map((e) => e.sequence)).toEqual([1]);
  expect(events).toHaveLength(2);
});
test('channel payload renderer preserves raw message and full hex and escapes untrusted content', () => {
  const render = fn('renderChannelData', 'renderEventData', {
    renderSection: (title, body) => title + body,
    renderValue: JSON.stringify,
    renderCollapsedSection: (title, body) => title + body,
    esc: (x) => String(x).replace(/</g, '&lt;'),
    t: (key) => key,
  });
  const output = render({
    message: '<raw>',
    summary: '发送确认',
    attachments: [{ label: '明文', value: '00 01 ff' }],
    data: { requestId: 2 },
  });
  expect(output).toContain('&lt;raw>');
  expect(output).toContain('00 01 ff');
  expect(output).toContain('requestId');
});

test('opening a channel session reads every server page and resumes streaming after the loaded sequence', async () => {
  const state = {
    appId: 'app',
    sessions: [{ sessionId: 'session', ackThrough: 450 }],
    events: [],
    maxSequence: 0,
  };
  const events = Array.from({ length: 450 }, (_, i) => ({
    sequence: i + 1,
    type: 'channel.ble',
    timestamp: 1,
    data: { message: 'raw' },
  }));
  const api = jest.fn(async (path) => {
    const cursor = Number(
      new URL('http://test' + path).searchParams.get('sinceSequence') || 0,
    );
    const page = events.filter((e) => e.sequence > cursor).slice(0, 200);
    return {
      events: page,
      nextSequence: page.at(-1)?.sequence,
      hasMore: cursor + page.length < 450,
    };
  });
  const start = html.indexOf('async function openSession('),
    end = html.indexOf('function startStream(', start);
  const stream = jest.fn();
  const open = vm.runInNewContext('(' + html.slice(start, end).trim() + ')', {
    state,
    api,
    app: { innerHTML: '' },
    closeStream() {},
    writeHash() {},
    esc: String,
    t: (key) => key,
    renderDetail() {},
    startStream: stream,
  });
  await open('session');
  expect(state.events).toHaveLength(450);
  expect(state.maxSequence).toBe(450);
  expect(api).toHaveBeenCalledTimes(3);
  expect(stream).toHaveBeenCalled();
});

test('raw channel errors participate in Failed only even when their severity is warn', () => {
  const failed = fn('isFailed', 'networkStatusLabel', {
    isRecord: (x) => x !== null && typeof x === 'object',
    isChannelType: (t) => t.startsWith('channel.'),
  });
  expect(
    failed({
      type: 'channel.ble',
      severity: 'warn',
      data: {
        message: 'offline',
        data: { error: { code: 'NOT_READY', delivery: 'not-sent' } },
      },
    }),
  ).toBe(true);
  expect(
    failed({
      type: 'channel.ble',
      severity: 'debug',
      data: { message: 'raw', data: { frame: { plaintextPdu: [0] } } },
    }),
  ).toBe(false);
});
test('same-millisecond channel events use transport sequence as recency tie-break', () => {
  const state = {
    events: [
      { sequence: 21, timestamp: 10, type: 'channel.ble', data: {} },
      { sequence: 34, timestamp: 10, type: 'channel.ble', data: {} },
    ],
    search: '',
    selectedType: 'channel.ble',
    includeDetail: true,
    failedOnly: false,
  };
  const filter = fn('filteredEvents', 'renderLogEntry', {
    state,
    isFailed: () => false,
    isChannelType: (t) => t.startsWith('channel.'),
    summary: () => '',
    stringify: JSON.stringify,
  });
  expect(filter().map((e) => e.sequence)).toEqual([34, 21]);
});
test('export includes live arrivals beyond the stale session-list acknowledgement', async () => {
  const state = {
    appId: 'app',
    sessionId: 'session',
    selectedType: 'channel.ble',
    session: { ackThrough: 10 },
    maxSequence: 20,
  };
  let exported;
  const start = html.indexOf('async function exportChannelLogs('),
    end = html.indexOf('async function openSession(', start);
  const run = vm.runInNewContext('(' + html.slice(start, end).trim() + ')', {
    state,
    $: () => ({ disabled: false }),
    isChannelType: (t) => t.startsWith('channel.'),
    api: async () => ({
      events: Array.from({ length: 20 }, (_, i) => ({
        sequence: i + 1,
        type: 'channel.ble',
        data: { message: 'raw' },
      })),
      hasMore: false,
      nextSequence: 20,
    }),
    Blob: class {
      constructor(parts) {
        exported = JSON.parse(parts[0]);
      }
    },
    URL: { createObjectURL: () => '/export', revokeObjectURL() {} },
    document: {
      body: { appendChild() {} },
      createElement: () => ({ click() {}, remove() {} }),
    },
    t: (key) => key,
  });
  await run();
  expect(exported.throughSequence).toBe(20);
  expect(exported.events).toHaveLength(20);
});
