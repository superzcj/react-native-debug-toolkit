'use strict';

const http = require('http');
const { URL } = require('url');
const { normalizeEndpoint } = require('../protocol/validation');
const { API_PREFIX } = require('../protocol/constants');

function request(method, urlStr, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: url.port || 3800,
      path: url.pathname + url.search,
      method,
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      timeout: timeoutMs || 10000,
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(raw); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function hubGet(endpoint, path, timeoutMs) {
  const url = `${endpoint}${path}`;
  return request('GET', url, null, timeoutMs);
}

async function hubPost(endpoint, path, body, timeoutMs) {
  const url = `${endpoint}${path}`;
  return request('POST', url, body, timeoutMs);
}

function apiPath(appId, ...rest) {
  const parts = [API_PREFIX, 'apps', encodeURIComponent(appId), ...rest];
  return parts.join('/');
}

module.exports = { request, hubGet, hubPost, apiPath };
