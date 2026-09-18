'use strict';

const fs = require('fs');
const path = require('path');

const consolePath = path.join(__dirname, 'console.html');
const localePath = path.join(__dirname, 'locales');
const sharedLocalePath = path.join(__dirname, '../../../../src/i18n/locales');
const supportedLocales = new Set(['auto', 'en', 'zh-CN']);
let cachedHtml = null;
let cachedMessages = null;

function normalizeLocaleOption(value) {
  if (value == null || value === '') return 'auto';
  return supportedLocales.has(String(value)) ? String(value) : null;
}

function resolveHubLocale(explicitLocale, environmentLocale = process.env.DEBUG_TOOLKIT_HUB_LOCALE) {
  if (explicitLocale !== undefined) {
    const explicit = normalizeLocaleOption(explicitLocale);
    if (explicit === null) throw new Error('locale must be one of: auto, en, zh-CN');
    return explicit;
  }
  const environment = normalizeLocaleOption(environmentLocale);
  return environment || 'auto';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadMessages() {
  if (cachedMessages) return cachedMessages;
  const messages = {};
  for (const locale of ['en', 'zh-CN']) {
    const shared = readJson(path.join(sharedLocalePath, `${locale}.json`));
    const web = readJson(path.join(localePath, `${locale}.json`));
    messages[locale] = { ...shared, ...web };
  }
  cachedMessages = messages;
  return messages;
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function createConsoleHandler(options = {}) {
  const locale = resolveHubLocale(options.locale);
  const messages = loadMessages();
  return function handleConsole(req, res, url, method) {
    if (method !== 'GET') return false;

    const pathname = url.pathname || url;
    if (pathname !== '/' && pathname !== '/console') return false;

    if (!cachedHtml) {
      try {
        cachedHtml = fs.readFileSync(consolePath, 'utf8');
      } catch {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Web Console not found');
        return true;
      }
    }

    // Keep the template immutable: each Hub instance gets its own startup locale
    // and dictionary payload without mutating the module-level HTML cache.
    const config = { locale, messages };
    const injected = `<script>window.__DT_HUB_CONFIG__=${escapeJsonForHtml(config)};</script>`;
    const html = cachedHtml
      .replace('<html lang="en">', `<html lang="${locale === 'zh-CN' ? 'zh-CN' : 'en'}">`)
      .replace('<!-- DT_HUB_CONFIG -->', injected);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(html),
      'cache-control': 'no-cache',
    });
    res.end(html);
    return true;
  };
}

module.exports = {
  createConsoleHandler,
  escapeJsonForHtml,
  loadMessages,
  normalizeLocaleOption,
  resolveHubLocale,
};
