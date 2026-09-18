'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  createConsoleHandler,
  escapeJsonForHtml,
  resolveHubLocale,
} = require('../src/console');

function render(handler) {
  return new Promise((resolve) => {
    const response = {
      writeHead: (status, headers) => { response.status = status; response.headers = headers; },
      end: (body) => resolve({ ...response, body }),
    };
    handler({}, response, { pathname: '/console' }, 'GET');
  });
}

function browserLocaleResolver() {
  const html = fs.readFileSync(path.join(__dirname, '../src/console/console.html'), 'utf8');
  const start = html.indexOf('function resolveBrowserLocale(');
  const end = html.indexOf('  const LOCALE', start);
  return vm.runInNewContext('(' + html.slice(start, end).trim() + ')');
}

describe('Web Console startup locale', () => {
  it('applies explicit locale before environment and defaults invalid environment to auto', () => {
    expect(resolveHubLocale(undefined, 'zh-CN')).toBe('zh-CN');
    expect(resolveHubLocale('en', 'zh-CN')).toBe('en');
    expect(resolveHubLocale('auto', 'zh-CN')).toBe('auto');
    expect(resolveHubLocale(undefined, 'fr-FR')).toBe('auto');
    expect(() => resolveHubLocale('fr-FR', 'zh-CN')).toThrow(/locale/);
  });

  it('matches browser Simplified and Traditional locale rules once at page load', () => {
    const resolve = browserLocaleResolver();
    expect(resolve('auto', ['zh-CN'])).toBe('zh-CN');
    expect(resolve('auto', ['zh-Hans'])).toBe('zh-CN');
    expect(resolve('auto', ['zh-SG'])).toBe('zh-CN');
    expect(resolve('auto', ['zh-Hans-TW'])).toBe('zh-CN');
    expect(resolve('auto', ['zh-Hant-TW'])).toBe('en');
    expect(resolve('auto', ['zh-Hant-CN'])).toBe('en');
    expect(resolve('auto', ['zh'])).toBe('en');
    expect(resolve('auto', ['fr-FR'])).toBe('en');
    expect(resolve('zh-CN', ['en-US'])).toBe('zh-CN');
  });

  it('escapes injected JSON and keeps Hub instances independent', async () => {
    const escaped = escapeJsonForHtml({ value: '</script><script>alert(1)</script>' });
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('\\u003c');

    const chinese = await render(createConsoleHandler({ locale: 'zh-CN' }));
    const english = await render(createConsoleHandler({ locale: 'en' }));
    expect(chinese.status).toBe(200);
    expect(chinese.body).toContain('"locale":"zh-CN"');
    expect(chinese.body).toContain('尚未连接应用');
    expect(english.body).toContain('"locale":"en"');
    expect(english.body).toContain('No Apps connected yet.');
  });
});
