'use strict';

const fs = require('fs');
const path = require('path');

const consolePath = path.join(__dirname, 'console.html');
let cachedHtml = null;

function createConsoleHandler() {
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

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(cachedHtml),
      'cache-control': 'no-cache',
    });
    res.end(cachedHtml);
    return true;
  };
}

module.exports = { createConsoleHandler };
