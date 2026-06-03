'use strict';

const fs = require('fs');
const path = require('path');

const { createDaemonServer } = require('../src/server');

function readConsoleHtml() {
  return fs.readFileSync(
    path.join(__dirname, '../src/console/console.html'),
    'utf8',
  );
}

describe('daemon web console script', () => {
  it('refreshes current data without routing through a full page rebuild', () => {
    const html = readConsoleHtml();

    expect(html).toContain('function refreshCurrentView()');
    expect(html).toContain('window.refresh = function() { refreshCurrentView(); };');
    expect(html).not.toContain('window.refresh = function() { route(); };');
  });

  it('does not reference undefined state during full SSE updates', () => {
    const html = readConsoleHtml();

    expect(html).not.toContain('!active');
  });

  it('uses stable log entry keys instead of visible array positions', () => {
    const html = readConsoleHtml();

    expect(html).toContain('function getLogEntryKey(entry, type, index)');
    expect(html).not.toContain("var rowId = 'row-' + i;");
    expect(html).not.toContain("var rowId = 'd' + count++;");
  });

  it('deduplicates live device cards by device id', () => {
    const html = readConsoleHtml();

    expect(html).toContain('data-device-id="');
    expect(html).toContain('function findDeviceCard(deviceId)');
    expect(html).toContain('var existing = findDeviceCard(deviceId)');
    expect(html).not.toContain('CSS.escape');
    expect(html).toContain('renderDeviceTags(payload.logCount || {})');
  });

  it('labels devices by device id, ip, and last seen metadata', () => {
    const html = readConsoleHtml();

    expect(html).toContain('function formatDevice(device)');
    expect(html).toContain('function formatIp(source)');
    expect(html).toContain('<strong>Device</strong>');
    expect(html).toContain('<strong>Last seen</strong>');
  });

  it('renders newest detail logs first with parsed detail sections', () => {
    const html = readConsoleHtml();

    expect(html).toContain('readTimestamp(b.entry) - readTimestamp(a.entry)');
    expect(html).toContain('function renderLogDetails(entry, type)');
    expect(html).toContain('function renderNetworkDetails(entry)');
    expect(html).toContain('class="log-detail');
  });

  it('shows curl commands in list and detail views', () => {
    const html = readConsoleHtml();

    expect(html).toContain('function curlCommand(path)');
    expect(html).toContain('Curl quick read');
    expect(html).toContain('Curl this device');
    expect(html).toContain('/logs?type=network&failedOnly=true&limit=50');
  });

  it('opens device details through delegated card navigation', () => {
    const html = readConsoleHtml();

    expect(html).toContain("closest('.device-card[data-device-id]')");
    expect(html).toContain('function openDeviceDetail(deviceId)');
    expect(html).not.toContain('onclick="location.hash');
  });

  it('uses pagination instead of a detail limit input', () => {
    const html = readConsoleHtml();

    expect(html).toContain('var PAGE_SIZE = 200;');
    expect(html).toContain('function renderPagination');
    expect(html).toContain('window.goToPage = function(page)');
    expect(html).not.toContain('id="limitInput"');
    expect(html).not.toContain('Limit <input');
  });

  it('patches live deltas without rerendering the visible log list', () => {
    const html = readConsoleHtml();

    expect(html).toContain('function appendDeltaLogs(deltaLogs)');
    expect(html).toContain('appendDeltaLogs(deltaLogs);');
    expect(html).toContain("list.insertAdjacentHTML('afterbegin', html)");
    expect(html).toContain('function updateVisibleIndexes(list)');
    expect(html).not.toContain("div.querySelector('.log-row').setAttribute");
  });

  it('holds live deltas off-page behind a new-log notice', () => {
    const html = readConsoleHtml();

    expect(html).toContain('var pendingLiveCount = 0;');
    expect(html).toContain('function updateLiveNotice()');
    expect(html).toContain('window.showLiveUpdates = function()');
    expect(html).toContain('if (currentPage !== 1)');
  });

  it('includes native log rendering support', async () => {
    const { server } = createDaemonServer({ token: '' });
    const html = readConsoleHtml();
    expect(html).toContain("native: 'Native'");
    expect(html).toContain('function renderNativeDetails');
    expect(html).toContain('log-type-native');
    await new Promise((resolve) => server.close(resolve));
  });
});
