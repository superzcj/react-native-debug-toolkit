'use strict';

const http = require('http');
const { URL } = require('url');
const { apiPath, hubGet, listAllSessions, HubReadError } = require('../httpClient');
const { getExitCode } = require('../../protocol/errors');
const { resolveSession } = require('./context');

const DEFAULT_DURATION_MS = 60 * 1000;
const MAX_EVENTS = 200;
const MAX_BYTES = 2 * 1024 * 1024;
const TRAILER_RESERVE = 8 * 1024;
const SESSION_CHECK_INTERVAL_MS = 2000;

async function resolveTailSession(options) {
  const { endpoint, appId, session: sessionId, allowStale } = options;
  if (!sessionId) {
    return resolveSession(endpoint, appId, sessionId, allowStale);
  }
  try {
    const listed = await listAllSessions(endpoint, appId);
    const session = (listed.sessions || []).find((item) => item.sessionId === sessionId);
    if (!session) {
      return {
        ok: false,
        code: 'NO_SESSION',
        message: 'Session not found for this app.',
        exitCode: getExitCode('NO_SESSION'),
      };
    }
    if (session.connectionState !== 'active' && !allowStale) {
      return {
        ok: false,
        code: 'STALE_SESSION',
        message: 'Session is stale. Pass --allow-stale to read it.',
        exitCode: getExitCode('STALE_SESSION'),
      };
    }
    return { ok: true, sessionId };
  } catch (err) {
    const code = err instanceof HubReadError ? err.code : 'HUB_UNREACHABLE';
    return {
      ok: false,
      code,
      message: err.message,
      exitCode: getExitCode(code),
    };
  }
}

async function tailCommand(options) {
  const { endpoint, appId, session: sessionId, sinceSequence, follow, durationMs, allowStale } = options;
  const output = options.output || process.stdout;

  const resolved = await resolveTailSession({ endpoint, appId, session: sessionId, allowStale });
  if (!resolved.ok) {
    writeNdjson(output, { kind: 'error', contentTrust: 'trusted-control', error: resolved });
    writeNdjson(output, { kind: 'end', contentTrust: 'trusted-control', reason: 'error', sequences: [] });
    return { exitCode: resolved.exitCode };
  }

  const sid = resolved.sessionId;
  const limitMs = follow ? Infinity : (durationMs ?? DEFAULT_DURATION_MS);
  let eventCount = 0;
  let totalBytes = 0;
  let lastSequence = sinceSequence != null ? Number(sinceSequence) : null;

  return new Promise((resolve) => {
    const query = lastSequence != null && Number.isFinite(lastSequence)
      ? `?sinceSequence=${encodeURIComponent(String(lastSequence))}`
      : '';
    const streamPath = apiPath(appId, 'sessions', sid, 'stream') + query;
    const url = new URL(`${endpoint}${streamPath}`);

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 3800,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'accept': 'text/event-stream',
        ...(lastSequence != null ? { 'last-event-id': String(lastSequence) } : {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      if (res.statusCode !== 200) {
        writeNdjson(output, { kind: 'error', contentTrust: 'trusted-control', error: { code: 'HUB_UNREACHABLE', message: `HTTP ${res.statusCode}` } });
        finish('error');
        return;
      }

      let buffer = '';
      let eventType = '';
      let eventId = '';
      let eventData = '';

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('id: ')) {
            eventId = line.slice(4).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          } else if (line === '') {
            if (eventData && eventType === 'event') {
              processEvent(eventData, eventId);
            }
            eventType = '';
            eventId = '';
            eventData = '';
          }
        }
      });

      res.on('end', () => finish('disconnect'));
      res.on('error', () => finish('error'));
    });

    req.on('error', (err) => {
      writeNdjson(output, { kind: 'error', contentTrust: 'trusted-control', error: { code: 'HUB_UNREACHABLE', message: err.message } });
      finish('error');
    });

    req.end();

    let durationTimer;
    if (limitMs !== Infinity) {
      durationTimer = setTimeout(() => finish('duration'), limitMs);
    }

    const sessionCheckTimer = setInterval(async () => {
      if (finished) return;
      try {
        const listed = await hubGet(endpoint, apiPath(appId, 'sessions'), 10000);
        const sessions = listed.body?.sessions || [];
        const selected = sessions.find(session => session.sessionId === sid);
        if (!selected) {
          writeNdjson(output, {
            kind: 'control', contentTrust: 'trusted-control',
            control: { type: 'selection_required', previousSessionId: sid, details: { candidates: [], omittedCount: 0 } },
          });
          finish('selection_required');
          return;
        }
        const replacements = sessions
          .filter(session => session.sessionId !== sid && session.deviceId === selected.deviceId && session.connectionState === 'active')
          .slice(0, 10);
        if (replacements.length > 0) {
          writeNdjson(output, {
            kind: 'control', contentTrust: 'trusted-control',
            control: {
              type: 'selection_required', previousSessionId: sid,
              details: { candidates: replacements, omittedCount: Math.max(0, replacements.length - 10) },
            },
          });
          finish('selection_required');
        }
      } catch {
        // The SSE request has its own reconnect/error path.
      }
    }, SESSION_CHECK_INTERVAL_MS);

    const sigintHandler = () => finish('interrupted');
    process.on('SIGINT', sigintHandler);

    function processEvent(data, id) {
      if (checkBudget()) return;
      try {
        const event = JSON.parse(data);
        const sequence = event.sequence || (id ? Number(id) : null);
        const record = {
          kind: 'event',
          contentTrust: 'untrusted',
          sessionId: sid,
          sequence,
          event,
        };
        const line = JSON.stringify(record);
        const lineBytes = Buffer.byteLength(line + '\n');

        if (totalBytes + lineBytes + TRAILER_RESERVE > MAX_BYTES) {
          finish('limit');
          return;
        }

        output.write(line + '\n');
        eventCount++;
        totalBytes += lineBytes;
        lastSequence = sequence || lastSequence;

        if (eventCount >= MAX_EVENTS) {
          finish('limit');
        }
      } catch { /* ignore malformed */ }
    }

    function checkBudget() {
      return eventCount >= MAX_EVENTS || totalBytes + TRAILER_RESERVE >= MAX_BYTES;
    }

    let finished = false;
    function finish(reason) {
      if (finished) return;
      finished = true;

      clearTimeout(durationTimer);
      clearInterval(sessionCheckTimer);
      process.removeListener('SIGINT', sigintHandler);
      req.destroy();

      const endRecord = {
        kind: 'end',
        contentTrust: 'trusted-control',
        reason,
        sequences: lastSequence != null ? [{ sessionId: sid, sinceSequence: lastSequence }] : [],
        omittedCount: 0,
      };
      writeNdjson(output, endRecord);

      const exitCode = reason === 'interrupted' ? 130 : (reason === 'error' ? getExitCode('HUB_UNREACHABLE') : 0);
      resolve({ exitCode });
    }
  });
}

function writeNdjson(output, record) {
  try { output.write(JSON.stringify(record) + '\n'); } catch { /* ignore */ }
}

module.exports = { tailCommand, resolveTailSession };
