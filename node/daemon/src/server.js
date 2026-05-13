'use strict';

const http = require('http');
const { URL } = require('url');

const {
  DAEMON_NAME,
  DAEMON_VERSION,
  REPORT_PROTOCOL_VERSION,
  getLanIPs,
} = require('./constants');
const { createMemoryStore } = require('./store');
const { createConsoleHandler } = require('./console');

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SSE_CLIENTS = 20;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        reject(Object.assign(new Error('Request body is required'), { statusCode: 400 }));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }));
      }
    });

    req.on('error', reject);
  });
}

function isValidReport(report) {
  return Boolean(
    report &&
    typeof report === 'object' &&
    report.version === REPORT_PROTOCOL_VERSION &&
    report.logs &&
    typeof report.logs === 'object' &&
    !Array.isArray(report.logs),
  );
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || Array.isArray(header)) {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function requireToken(req, url, token) {
  if (!token) {
    return true;
  }
  return getBearerToken(req) === token || url.searchParams.get('token') === token;
}

function authorizeRequest(req, res, url, token) {
  if (requireToken(req, url, token)) {
    return true;
  }

  sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  return false;
}

function toSessionPayload(session) {
  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    receivedAt: session.receivedAt,
    logCount: session.logCount,
    report: session.report,
  };
}

function selectLogs(session, searchParams) {
  if (!session) {
    return [];
  }

  const type = searchParams.get('type');
  const limitParam = Number(searchParams.get('limit') || 50);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.floor(limitParam), 500)
    : 50;
  const failedOnly = searchParams.get('failedOnly') === 'true';
  const logs = session.report.logs || {};

  let entries = [];
  if (type) {
    entries = Array.isArray(logs[type]) ? logs[type] : [];
  } else {
    entries = Object.values(logs).flatMap((value) => Array.isArray(value) ? value : []);
  }

  if (failedOnly) {
    entries = entries.filter((entry) => (
      entry &&
      typeof entry === 'object' &&
      (
        Boolean(entry.error) ||
        entry.level === 'error' ||
        entry.response?.success === false ||
        entry.response?.status >= 400
      )
    ));
  }

  return entries.slice(-limit);
}

function broadcastSSE(clients, eventType, session, delta) {
  if (clients.size === 0) return;

  const payload = delta
    ? { type: 'delta', sessionId: session.sessionId, delta, logCount: session.logCount }
    : { type: 'full', sessionId: session.sessionId, logCount: session.logCount, device: session.report.device || null };
  const data = JSON.stringify(payload);

  clients.forEach((client) => {
    try {
      client.write(`event: ${eventType}\ndata: ${data}\n\n`);
    } catch {
      clients.delete(client);
    }
  });
}

function createDaemonServer(options = {}) {
  const sseClients = new Set();
  const maxSseClients = options.maxSseClients || MAX_SSE_CLIENTS;
  let keepaliveTimer = null;

  const store = options.store || createMemoryStore({
    onUpdate(session, type, delta) {
      broadcastSSE(sseClients, 'logs', session, type === 'delta' ? delta : null);
    },
  });
  const token = options.token || null;
  const handleConsole = createConsoleHandler({
    authorize: (req, res, url) => authorizeRequest(req, res, url, token),
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const method = req.method || 'GET';

    if (handleConsole(req, res, url, method)) return;

    if (method === 'GET' && url.pathname === '/events') {
      if (!authorizeRequest(req, res, url, token)) return;
      if (sseClients.size >= maxSseClients) {
        sendJson(res, 503, { ok: false, error: 'Too many SSE clients' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      sseClients.add(res);
      req.on('close', () => { sseClients.delete(res); });

      const latest = store.getLatestSession();
      if (latest) {
        const data = JSON.stringify({ type: 'full', sessionId: latest.sessionId, logCount: latest.logCount, device: latest.report.device || null });
        res.write(`event: logs\ndata: ${data}\n\n`);
      }

      if (!keepaliveTimer) {
        keepaliveTimer = setInterval(() => {
          if (sseClients.size > 0) {
            sseClients.forEach((client) => {
              try { client.write(':keepalive\n\n'); } catch { sseClients.delete(client); }
            });
          } else {
            clearInterval(keepaliveTimer);
            keepaliveTimer = null;
          }
        }, 30000);
      }
      return;
    }

    if (method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        name: DAEMON_NAME,
        version: DAEMON_VERSION,
        protocolVersion: REPORT_PROTOCOL_VERSION,
        ips: getLanIPs(),
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/report') {
      if (!authorizeRequest(req, res, url, token)) return;

      try {
        const report = await readJsonBody(req);
        if (!isValidReport(report)) {
          sendJson(res, 400, {
            ok: false,
            error: `Report must include version ${REPORT_PROTOCOL_VERSION} and logs object`,
          });
          return;
        }

        const session = store.saveReport(report);
        sendJson(res, 200, {
          ok: true,
          sessionId: session.sessionId,
          receivedAt: session.receivedAt,
          logCount: session.logCount,
        });
      } catch (error) {
        sendJson(res, error.statusCode || 500, {
          ok: false,
          error: error.message || 'Failed to read report',
        });
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/ingest') {
      if (!authorizeRequest(req, res, url, token)) return;

      try {
        const body = await readJsonBody(req);
        if (!body || typeof body.sessionId !== 'string' || !body.delta) {
          sendJson(res, 400, { ok: false, error: 'Must include sessionId and delta' });
          return;
        }

        const session = store.appendLogs(body.sessionId, body.delta);
        if (!session) {
          sendJson(res, 404, { ok: false, error: 'Session not found' });
          return;
        }

        sendJson(res, 200, { ok: true, sessionId: session.sessionId, logCount: session.logCount });
      } catch (error) {
        sendJson(res, error.statusCode || 500, {
          ok: false,
          error: error.message || 'Failed to ingest',
        });
      }
      return;
    }

    if (method === 'GET' && (url.pathname === '/latest' || url.pathname === '/sessions/latest')) {
      if (!authorizeRequest(req, res, url, token)) return;

      const session = store.getLatestSession();
      if (!session) {
        sendJson(res, 404, { ok: false, error: 'No debug session report has been received' });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        ...toSessionPayload(session),
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/sessions') {
      if (!authorizeRequest(req, res, url, token)) return;

      sendJson(res, 200, { ok: true, sessions: store.listSessions() });
      return;
    }

    if (method === 'DELETE' && url.pathname === '/sessions') {
      if (!authorizeRequest(req, res, url, token)) return;

      store.clear();
      sendJson(res, 200, { ok: true });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(?:\/logs)?$/);
    if (method === 'GET' && sessionMatch) {
      if (!authorizeRequest(req, res, url, token)) return;

      const session = store.getSession(decodeURIComponent(sessionMatch[1]));
      if (!session) {
        sendJson(res, 404, { ok: false, error: 'Session not found' });
        return;
      }

      if (url.pathname.endsWith('/logs')) {
        sendJson(res, 200, {
          ok: true,
          sessionId: session.sessionId,
          receivedAt: session.receivedAt,
          logs: selectLogs(session, url.searchParams),
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        ...toSessionPayload(session),
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  server.on('close', () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    sseClients.forEach((client) => {
      try { client.destroy(); } catch {}
    });
    sseClients.clear();
  });

  return { server, store };
}

module.exports = {
  createDaemonServer,
  isValidReport,
};
