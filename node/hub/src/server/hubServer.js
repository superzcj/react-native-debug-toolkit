'use strict';

const http = require('http');
const { URL } = require('url');
const os = require('os');
const { API_PREFIX, DEFAULT_PORT, HUB_NAME, HUB_VERSION } = require('../protocol/constants');
const { HubStore } = require('../storage/hubStore');
const { sendJson, sendError } = require('./httpUtils');
const routes = require('./routes');
const { createConsoleHandler } = require('../console');

function createHubServer(options = {}) {
  const dataDir = options.dataDir || '/Users/Shared/ReactNativeDebugToolkitHub/data';
  const bindAddress = options.bindAddress || '127.0.0.1';
  const port = options.port ?? DEFAULT_PORT;
  const configuredAdvertiseUrl = options.advertiseUrl;

  const hub = new HubStore(dataDir);
  const handleConsole = createConsoleHandler();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';
    const pathname = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      // Web Console
      if (handleConsole(req, res, url, method)) return;

      // Health & Ready
      if (method === 'GET' && pathname === '/health') {
        return routes.handleHealth(req, res, hub);
      }
      if (method === 'GET' && pathname === '/ready') {
        return routes.handleReady(req, res, hub);
      }

      // API v1 routes
      if (!pathname.startsWith(API_PREFIX)) {
        return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      }

      const apiPath = pathname.slice(API_PREFIX.length);
      const appsMatch = apiPath.match(/^\/apps\/([^/]+)\/sessions(?:\/([^/]+)(?:\/(events|heartbeat|context|stream|entries\/(.+)))?)?$/);
      
      if (!appsMatch) {
        return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      }

      const appId = decodeURIComponent(appsMatch[1]);
      const sessionId = appsMatch[2] ? decodeURIComponent(appsMatch[2]) : null;
      const action = appsMatch[3];
      const entryId = appsMatch[4] ? decodeURIComponent(appsMatch[4]) : null;

      if (!sessionId) {
        if (method === 'GET') return routes.handleSessionsList(req, res, hub, appId);
        if (method === 'POST') return await routes.handleSessionOpen(req, res, hub, appId);
        return sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
      }

      if (!action) {
        // GET session info could go here
        return sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
      }

      if (action === 'events' && method === 'POST') return await routes.handleEvents(req, res, hub, appId, sessionId);
      if (action === 'events' && method === 'GET') return routes.handleQueryEvents(req, res, hub, appId, sessionId);
      if (action === 'heartbeat' && method === 'POST') return await routes.handleHeartbeat(req, res, hub, appId, sessionId);
      if (action === 'context' && method === 'GET') return routes.handleContext(req, res, hub, appId, sessionId);
      if (action === 'stream' && method === 'GET') return routes.handleStream(req, res, hub, appId, sessionId);
      if (action.startsWith('entries/') && entryId && method === 'GET') {
        return routes.handleInspect(req, res, hub, appId, sessionId, entryId);
      }

      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
    } catch (error) {
      if (!res.headersSent) {
        sendError(res, 'INTERNAL_ERROR', error.message || 'Internal server error');
      }
    }
  });

  async function start() {
    await hub.initialize();
    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, bindAddress, () => {
        const addr = server.address();
        process.stderr.write(`${HUB_NAME} v${HUB_VERSION} listening on http://${addr.address}:${addr.port}\n`);
        const advertiseUrl = configuredAdvertiseUrl || `http://${addr.address}:${addr.port}`;
        hub.setAdvertiseUrl(advertiseUrl);
        process.stderr.write(`Advertise URL: ${advertiseUrl}\n`);
        process.stderr.write(`Data directory: ${dataDir}\n`);
        resolve({ server, hub, address: addr });
      });
    });
  }

  function stop() {
    hub.close();
    return new Promise((resolve) => {
      server.close(resolve);
    });
  }

  return { server, hub, start, stop };
}

module.exports = { createHubServer };
