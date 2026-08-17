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

class HubReadError extends Error {
  constructor({ code, message, endpoint, path, httpStatus = null }) {
    super(message);
    this.name = 'HubReadError';
    this.code = code;
    this.endpoint = endpoint;
    this.path = path;
    this.httpStatus = httpStatus;
  }
}

const PRESERVED_READ_CODES = Object.freeze({
  HUB_NOT_READY: 503,
  NO_SESSION: 404,
  PROTOCOL_MISMATCH: 426,
});

const FIXED_READ_MESSAGES = Object.freeze({
  HUB_UNREACHABLE: 'Hub is unreachable',
  HUB_NOT_READY: 'Hub is not ready',
  NO_SESSION: 'Session not found',
  PROTOCOL_MISMATCH: 'Hub protocol mismatch',
  INVALID_RESPONSE: 'Hub returned an invalid response',
});

function toHubReadError(endpoint, requestPath, response) {
  const httpStatus = response && typeof response.status === 'number' ? response.status : null;
  const body = response && response.body;
  const codeFromBody = body && typeof body === 'object' ? body.error?.code : null;
  let code = 'INVALID_RESPONSE';
  if (codeFromBody && PRESERVED_READ_CODES[codeFromBody] === httpStatus) {
    code = codeFromBody;
  }
  return new HubReadError({
    code,
    message: FIXED_READ_MESSAGES[code] || FIXED_READ_MESSAGES.INVALID_RESPONSE,
    endpoint,
    path: requestPath,
    httpStatus,
  });
}

async function listAllSessions(endpoint, appId, query = {}) {
  const sessions = [];
  const seen = new Set();
  let cursor = null;
  let pages = 0;
  do {
    const params = new URLSearchParams({ limit: '50', order: 'sessionId', ...query });
    if (cursor) {
      params.set('cursor', cursor);
    }
    const requestPath = `${apiPath(appId, 'sessions')}?${params}`;
    let response;
    try {
      response = await hubGet(endpoint, requestPath, 10000);
    } catch (cause) {
      throw new HubReadError({
        code: 'HUB_UNREACHABLE',
        message: FIXED_READ_MESSAGES.HUB_UNREACHABLE,
        endpoint,
        path: requestPath,
      });
    }
    if (!response.body || response.body.ok !== true || !Array.isArray(response.body.sessions)) {
      throw toHubReadError(endpoint, requestPath, response);
    }
    if (response.status < 200 || response.status >= 300) {
      throw toHubReadError(endpoint, requestPath, response);
    }
    sessions.push(...response.body.sessions);
    pages += 1;
    cursor = response.body.nextCursor ?? null;
    if (cursor != null && typeof cursor !== 'string') {
      throw new HubReadError({
        code: 'INVALID_RESPONSE',
        message: FIXED_READ_MESSAGES.INVALID_RESPONSE,
        endpoint,
        path: requestPath,
        httpStatus: response.status,
      });
    }
    if (cursor && seen.has(cursor)) {
      throw new HubReadError({
        code: 'INVALID_RESPONSE',
        message: 'Hub repeated a Session cursor',
        endpoint,
        path: requestPath,
        httpStatus: response.status,
      });
    }
    if (cursor) {
      seen.add(cursor);
    }
  } while (cursor);
  return { sessions, pages };
}

module.exports = {
  request,
  hubGet,
  hubPost,
  apiPath,
  HubReadError,
  toHubReadError,
  listAllSessions,
};

