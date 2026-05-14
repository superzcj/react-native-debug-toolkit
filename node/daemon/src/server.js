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

function normalizeIpAddress(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  if (value.startsWith('::ffff:')) {
    return value.slice(7);
  }

  return value;
}

function getRequestSource(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : null;
  const ip = normalizeIpAddress((forwardedIp || '').trim()) ||
    normalizeIpAddress(req.socket && req.socket.remoteAddress);
  const userAgent = req.headers['user-agent'];

  return {
    ip: ip || 'unknown',
    userAgent: typeof userAgent === 'string' ? userAgent : '',
  };
}

function toDevicePayload(deviceLog) {
  if (!deviceLog) {
    return null;
  }

  return {
    deviceId: deviceLog.deviceId,
    firstSeenAt: deviceLog.firstSeenAt,
    lastSeenAt: deviceLog.lastSeenAt,
    receivedAt: deviceLog.receivedAt,
    device: deviceLog.device || null,
    source: deviceLog.source || null,
    logCount: deviceLog.logCount,
    report: deviceLog.report,
  };
}

function selectLogs(deviceLog, searchParams) {
  if (!deviceLog) {
    return [];
  }

  const type = searchParams.get('type');
  const limitParam = Number(searchParams.get('limit') || 50);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(Math.floor(limitParam), 500)
    : 50;
  const failedOnly = searchParams.get('failedOnly') === 'true';
  const logs = deviceLog.report.logs || {};

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

function broadcastSSE(clients, eventType, deviceLog, delta) {
  if (clients.size === 0) return;

  const payload = delta
    ? { type: 'delta', deviceId: deviceLog.deviceId, delta, logCount: deviceLog.logCount }
    : {
      type: 'full',
      deviceId: deviceLog.deviceId,
      logCount: deviceLog.logCount,
      device: deviceLog.device || null,
      source: deviceLog.source || null,
    };
  const data = JSON.stringify(payload);

  clients.forEach((client) => {
    try {
      client.write(`event: ${eventType}\ndata: ${data}\n\n`);
    } catch {
      clients.delete(client);
    }
  });
}

// --- Route Handlers ---

function handleHealth(req, res, ctx) {
  sendJson(res, 200, {
    ok: true,
    name: DAEMON_NAME,
    version: DAEMON_VERSION,
    protocolVersion: REPORT_PROTOCOL_VERSION,
    ips: getLanIPs(),
    deviceStore: ctx.options.deviceStorePath || null,
  });
}

async function handleReport(req, res, ctx) {
  if (!authorizeRequest(req, res, req.url, ctx.token)) return;

  try {
    const report = await readJsonBody(req);
    if (!isValidReport(report)) {
      sendJson(res, 400, {
        ok: false,
        error: `Report must include version ${REPORT_PROTOCOL_VERSION} and logs object`,
      });
      return;
    }

    const deviceLog = ctx.store.saveReport(report, { source: getRequestSource(req) });
    sendJson(res, 200, {
      ok: true,
      deviceId: deviceLog.deviceId,
      receivedAt: deviceLog.receivedAt,
      logCount: deviceLog.logCount,
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Failed to read report',
    });
  }
}

async function handleIngest(req, res, ctx) {
  if (!authorizeRequest(req, res, req.url, ctx.token)) return;

  try {
    const body = await readJsonBody(req);
    if (!body || typeof body.deviceId !== 'string' || !body.delta) {
      sendJson(res, 400, { ok: false, error: 'Must include deviceId and delta' });
      return;
    }

    const deviceLog = ctx.store.appendLogs(body.deviceId, body.delta);
    if (!deviceLog) {
      sendJson(res, 404, { ok: false, error: 'Device not found' });
      return;
    }

    sendJson(res, 200, { ok: true, deviceId: deviceLog.deviceId, logCount: deviceLog.logCount });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message || 'Failed to ingest',
    });
  }
}

function handleLatestDevice(req, res, ctx) {
  if (!authorizeRequest(req, res, req.url, ctx.token)) return;

  const deviceLog = ctx.store.getLatestDevice();
  if (!deviceLog) {
    sendJson(res, 404, { ok: false, error: 'No device logs have been received' });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    ...toDevicePayload(deviceLog),
  });
}

function handleDevicesList(req, res, ctx) {
  if (!authorizeRequest(req, res, req.url, ctx.token)) return;

  sendJson(res, 200, { ok: true, devices: ctx.store.listDevices() });
}

function handleDevicesClear(req, res, ctx) {
  if (!authorizeRequest(req, res, req.url, ctx.token)) return;

  ctx.store.clear();
  sendJson(res, 200, { ok: true });
}

function handleDeviceMatch(req, res, ctx, url, deviceMatch) {
  if (!authorizeRequest(req, res, url, ctx.token)) return;

  const deviceLog = ctx.store.getDevice(decodeURIComponent(deviceMatch[1]));
  if (!deviceLog) {
    sendJson(res, 404, { ok: false, error: 'Device not found' });
    return;
  }

  if (url.pathname.endsWith('/logs')) {
    sendJson(res, 200, {
      ok: true,
      deviceId: deviceLog.deviceId,
      receivedAt: deviceLog.receivedAt,
      logs: selectLogs(deviceLog, url.searchParams),
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    ...toDevicePayload(deviceLog),
  });
}

// --- Server Factory ---

function createDaemonServer(options = {}) {
  const sseClients = new Set();
  const maxSseClients = options.maxSseClients || MAX_SSE_CLIENTS;
  let keepaliveTimer = null;

  const store = options.store || createMemoryStore({
    storagePath: options.deviceStorePath || null,
    onUpdate(deviceLog, type, delta) {
      broadcastSSE(sseClients, 'logs', deviceLog, type === 'delta' ? delta : null);
    },
  });
  const token = options.token || null;
  const handleConsole = createConsoleHandler({
    authorize: (req, res, url) => authorizeRequest(req, res, url, token),
  });

  const ctx = { store, token, options };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const method = req.method || 'GET';
    req.url = url;

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

      const latest = store.getLatestDevice();
      if (latest) {
        const data = JSON.stringify({
          type: 'full',
          deviceId: latest.deviceId,
          logCount: latest.logCount,
          device: latest.device || null,
          source: latest.source || null,
        });
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
      return handleHealth(req, res, ctx);
    }

    if (method === 'POST' && url.pathname === '/report') {
      return await handleReport(req, res, ctx);
    }

    if (method === 'POST' && url.pathname === '/ingest') {
      return await handleIngest(req, res, ctx);
    }

    if (method === 'GET' && url.pathname === '/devices/latest') {
      return handleLatestDevice(req, res, ctx);
    }

    if (method === 'GET' && url.pathname === '/devices') {
      return handleDevicesList(req, res, ctx);
    }

    if (method === 'DELETE' && url.pathname === '/devices') {
      return handleDevicesClear(req, res, ctx);
    }

    const deviceMatch = url.pathname.match(/^\/devices\/([^/]+)(?:\/logs)?$/);
    if (method === 'GET' && deviceMatch) {
      return handleDeviceMatch(req, res, ctx, url, deviceMatch);
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
  handleHealth,
  handleReport,
  handleIngest,
  handleLatestDevice,
  handleDevicesList,
  handleDevicesClear,
  handleDeviceMatch,
  isValidReport,
};
