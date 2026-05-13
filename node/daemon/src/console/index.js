'use strict';

const fs = require('fs');
const path = require('path');

function sendUnauthorized(res) {
  const body = 'Unauthorized';
  res.writeHead(401, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function createConsoleHandler(options = {}) {
  const htmlPath = path.join(__dirname, 'console.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const htmlBytes = Buffer.byteLength(html);
  const authorize = options.authorize || (() => true);

  return function handleConsoleRequest(req, res, url, method) {
    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(302, { location: `/console${url.search || ''}` });
      res.end();
      return true;
    }

    if (method === 'GET' && url.pathname === '/console') {
      if (!authorize(req, res, url)) {
        if (!res.headersSent) sendUnauthorized(res);
        return true;
      }

      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': htmlBytes,
        'cache-control': 'no-store',
      });
      res.end(html);
      return true;
    }

    return false;
  };
}

module.exports = { createConsoleHandler };
