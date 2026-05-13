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

  it('deduplicates live session cards by session id', () => {
    const html = readConsoleHtml();

    expect(html).toContain('data-sid="');
    expect(html).toContain('var existing = grid.querySelector');
    expect(html).toContain('renderSessionTags(payload.logCount || {})');
  });
});
