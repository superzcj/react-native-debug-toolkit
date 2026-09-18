'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the renderer with the serialized optional fields observed in a real RN report.
const html = fs.readFileSync(path.join(__dirname, '../src/console/console.html'), 'utf8');
const source = html.slice(html.indexOf('function renderNetworkData('), html.indexOf('function renderNavigationData('));
const render = vm.runInNewContext('(' + source.trim() + ')', {
  isRecord: value => value !== null && typeof value === 'object',
  esc: String,
  t: (key, params = {}) => key === 'web.error' ? `Error: ${params.value}` : key,
  renderSection: () => '', renderCollapsedSection: () => '', renderValue: () => '', buildCurl: () => '',
});

test('omits nontext optional metadata and retains a structured error message', () => {
  const base = { request: { url: '/checkout', method: 'POST' }, response: { status: 409, statusText: {} }, duration: 21, error: {} };
  const emptyMetadata = render(base);
  expect(emptyMetadata).toContain('409');
  expect(emptyMetadata).not.toContain('[object Object]');
  expect(emptyMetadata).not.toContain('Error:');
  expect(render({ ...base, error: { message: 'Connection lost' } })).toContain('Error: Connection lost');
  expect(render({ ...base, response: { status: 409, statusText: 'Conflict' }, error: 'Timeout' })).toContain('409 Conflict');
});
