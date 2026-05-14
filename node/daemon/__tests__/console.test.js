'use strict';

const fs = require('fs');
const path = require('path');

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
    expect(html).toContain('var existing = grid.querySelector');
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
    expect(html).toContain('class="log-details"');
  });

  it('shows curl commands in list and detail views', () => {
    const html = readConsoleHtml();

    expect(html).toContain('function curlCommand(path)');
    expect(html).toContain('Curl quick read');
    expect(html).toContain('Curl this device');
    expect(html).toContain('/logs?type=network&failedOnly=true&limit=50');
  });
});
