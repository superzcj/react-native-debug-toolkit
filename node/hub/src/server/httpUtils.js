'use strict';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-cache',
  });
  res.end(body);
}

function readJsonBody(req, maxBytes) {
  const limit = maxBytes || MAX_BODY_BYTES;
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve(null); return; }
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendError(res, code, message, details, suggestedAction) {
  const { createErrorResponse, getHttpStatus } = require('../protocol/errors');
  const status = getHttpStatus(code);
  sendJson(res, status || 500, createErrorResponse(code, message, details, suggestedAction));
}

function getSourceIp(req) {
  const addr = req.socket?.remoteAddress || '';
  if (addr.startsWith('::ffff:')) return addr.slice(7);
  return addr || 'unknown';
}

function parsePath(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  return rest.split('/').filter(Boolean);
}

module.exports = { sendJson, readJsonBody, sendError, getSourceIp, parsePath, MAX_BODY_BYTES };
