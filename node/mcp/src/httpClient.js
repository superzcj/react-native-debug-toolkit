'use strict';

const http = require('http');
const https = require('https');

function requestJson(origin, path, options = {}) {
  const url = new URL(path, origin);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeoutMs || 3000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          reject(new Error(`Daemon returned non-JSON response from ${path}`));
          return;
        }

        resolve({
          status: res.statusCode || 0,
          body,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Daemon request timed out: ${path}`));
    });
    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

module.exports = {
  requestJson,
};
