'use strict';

const {
  PROTOCOL_VERSION, CANONICAL_VERSION, API_PREFIX,
  HUB_NAME, HUB_VERSION, MAX_BATCH_EVENTS, MAX_BATCH_BYTES,
  MAX_STORAGE_BYTES,
} = require('../protocol/constants');
const { createErrorResponse, getHttpStatus } = require('../protocol/errors');
const {
  isValidAppId, isValidSessionId, validateDeviceMetadata,
  isValidSequence, validateWireEvent, normalizeSeverity,
} = require('../protocol/validation');
const { createEventCursor, createSnapshotCursor, parseCursor } = require('../protocol/cursor');
const { sendJson, readJsonBody, sendError, getSourceIp, parsePath } = require('./httpUtils');

function handleHealth(req, res, hub) {
  sendJson(res, 200, { ok: true, name: HUB_NAME, version: HUB_VERSION });
}

function handleReady(req, res, hub) {
  if (!hub.isReady()) {
    return sendError(res, 'HUB_NOT_READY', 'Hub is initializing');
  }
  const info = hub.getHubInfo();
  const usage = hub.getStorageUsage();
  sendJson(res, 200, {
    ok: true,
    name: HUB_NAME,
    version: HUB_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    canonicalVersion: CANONICAL_VERSION,
    hubInstanceId: info.hubInstanceId,
    hubRef: info.hubRef,
    advertiseUrl: info.advertiseUrl,
    uptime: process.uptime(),
    serverTime: new Date().toISOString(),
    storageUsageBytes: usage,
    storageFull: hub.isStorageFull(),
    storage: { usedBytes: usage, limitBytes: MAX_STORAGE_BYTES },
    apps: hub.listAppIds(),
  });
}

async function handleSessionOpen(req, res, hub, appId) {
  if (!isValidAppId(appId)) {
    return sendError(res, 'INVALID_ARGUMENT', `Invalid appId: ${appId}`);
  }

  const body = await readJsonBody(req);
  if (!body) return sendError(res, 'INVALID_ARGUMENT', 'Request body required');

  if (body.protocolVersion !== PROTOCOL_VERSION) {
    return sendError(res, 'PROTOCOL_MISMATCH',
      `Expected protocol version ${PROTOCOL_VERSION}, got ${body.protocolVersion}`,
      {}, 'Upgrade the App or Hub to a matching version.');
  }
  if (body.canonicalVersion !== CANONICAL_VERSION) {
    return sendError(res, 'PROTOCOL_MISMATCH',
      `Expected canonical version ${CANONICAL_VERSION}, got ${body.canonicalVersion}`);
  }

  if (!isValidSessionId(body.sessionId)) {
    return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');
  }

  const deviceError = validateDeviceMetadata(body.device);
  if (deviceError) {
    return sendError(res, 'INVALID_ARGUMENT', deviceError);
  }

  if (hub.isStorageFull()) {
    return sendError(res, 'STORAGE_FULL', 'Hub storage is full');
  }

  const sourceIp = getSourceIp(req);
  const result = await hub.openSession(appId, body.sessionId, {
    device: body.device,
    startedAt: body.startedAt,
    clientAckThrough: body.clientAckThrough || 0,
  }, sourceIp);

  if (!result.ok) {
    const status = getHttpStatus(result.code);
    return sendJson(res, status || 409, createErrorResponse(result.code, result.message));
  }

  const httpStatus = result.isResume ? 200 : 201;
  const hubInfo = hub.getHubInfo();
  sendJson(res, httpStatus, {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    canonicalVersion: CANONICAL_VERSION,
    sessionId: result.sessionId,
    hubRef: hubInfo.hubRef,
    sessionRef: result.sessionRef,
    bindingEpoch: result.bindingEpoch,
    deviceId: result.deviceId,
    generation: result.generation,
    ackThrough: result.ackThrough,
    expectedSequence: result.expectedSequence,
    rejected: result.rejected,
    serverTime: new Date().toISOString(),
  });
}

async function handleEvents(req, res, hub, appId, sessionId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');
  if (!isValidSessionId(sessionId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');

  const session = hub.getSession(sessionId);
  if (!session) return sendError(res, 'NO_SESSION', 'Session not found');

  const info = session.getSessionInfo();
  if (info.appId !== appId) return sendError(res, 'INVALID_ARGUMENT', 'Session does not belong to this appId');

  if (hub.isStorageFull()) return sendError(res, 'STORAGE_FULL', 'Hub storage is full');

  const body = await readJsonBody(req, MAX_BATCH_BYTES);
  if (!body) return sendError(res, 'INVALID_ARGUMENT', 'Request body required');
  if (!body.generation) return sendError(res, 'INVALID_ARGUMENT', 'generation required');
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return sendError(res, 'INVALID_ARGUMENT', 'events array required');
  }
  if (body.events.length > MAX_BATCH_EVENTS) {
    return sendError(res, 'INVALID_ARGUMENT', `Batch exceeds ${MAX_BATCH_EVENTS} event limit`);
  }

  // Validate wire events
  for (const event of body.events) {
    const err = validateWireEvent(event);
    if (err) return sendError(res, 'INVALID_ARGUMENT', err);
  }

  // Verify contiguous and firstSequence matches
  if (!isValidSequence(body.firstSequence)) {
    return sendError(res, 'INVALID_ARGUMENT', 'Invalid firstSequence');
  }
  if (body.events[0].sequence !== body.firstSequence) {
    return sendError(res, 'INVALID_ARGUMENT', 'firstSequence does not match first event');
  }

  const result = await session.appendEvents(body.generation, body.firstSequence, body.events);

  if (!result.ok) {
    const status = getHttpStatus(result.code);
    return sendJson(res, status || 409, createErrorResponse(result.code, result.message, {
      expectedSequence: result.expectedSequence,
    }));
  }

  sendJson(res, 200, {
    ok: true,
    ackThrough: result.ackThrough,
    expectedSequence: result.expectedSequence,
    rejected: result.rejected,
  });
}

async function handleHeartbeat(req, res, hub, appId, sessionId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');
  if (!isValidSessionId(sessionId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');

  const session = hub.getSession(sessionId);
  if (!session) return sendError(res, 'NO_SESSION', 'Session not found');

  const body = await readJsonBody(req);
  if (!body || !body.generation) return sendError(res, 'INVALID_ARGUMENT', 'generation required');

  const result = await session.heartbeat(body.generation, body.syncState, body.clientAckThrough);
  if (!result.ok) {
    const status = getHttpStatus(result.code);
    return sendJson(res, status || 409, createErrorResponse(result.code));
  }

  sendJson(res, 200, { ok: true, ...result });
}

function handleSessionsList(req, res, hub, appId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');

  const url = new URL(req.url || '/', 'http://localhost');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 50);
  const result = hub.listSessions(appId, { limit });

  sendJson(res, 200, {
    ok: true,
    ...result,
  });
}

function handleContext(req, res, hub, appId, sessionId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');
  if (!isValidSessionId(sessionId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');

  const session = hub.getSession(sessionId);
  if (!session) return sendError(res, 'NO_SESSION', 'Session not found');

  const info = session.getSessionInfo();
  if (info.appId !== appId) return sendError(res, 'INVALID_ARGUMENT', 'Session does not belong to this appId');

  const url = new URL(req.url || '/', 'http://localhost');
  const throughParam = url.searchParams.get('through');
  const sinceParam = url.searchParams.get('since');
  const untilParam = url.searchParams.get('until');

  const signer = hub.getCursorSigner();
  let throughSequence = info.ackThrough;
  let capturedAt = new Date().toISOString();
  let params = { since: sinceParam || null, until: untilParam || null };

  if (throughParam) {
    const parsed = parseCursor(signer, throughParam, sessionId);
    if (!parsed.valid) return sendError(res, parsed.code, 'Invalid or mismatched snapshot cursor');
    if (parsed.payload.kind !== 'snapshot') return sendError(res, 'CURSOR_INVALID', 'Expected snapshot cursor');
    throughSequence = parsed.payload.throughSequence;
    capturedAt = parsed.payload.capturedAt;
    params = parsed.payload.params || {};
    if ((sinceParam || null) !== (params.since || null) ||
        (untilParam || null) !== (params.until || null)) {
      return sendError(res, 'INVALID_ARGUMENT', 'Snapshot cursor parameters do not match this request');
    }
  }

  // Build context window
  const capturedAtMs = new Date(capturedAt).getTime();
  const windowMs = 10 * 60 * 1000;
  const sinceMs = params.since ? new Date(params.since).getTime() : capturedAtMs - windowMs;
  const untilMs = params.until ? new Date(params.until).getTime() : capturedAtMs;

  const allEvents = session.queryEvents({
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
  });

  // Filter to throughSequence
  let events = allEvents.events.filter(e => e.sequence <= throughSequence);

  // Context selection algorithm (section 10.3)
  const errors = events.filter(e =>
    e.severity === 'error' || e.severity === 'fatal' ||
    (e.type === 'network' && (e.data?.error || (e.data?.response?.status >= 400)))
  ).slice(-50);

  const errorSequences = new Set(errors.map(e => e.sequence));
  const adjacentSequences = new Set();
  for (const seq of errorSequences) {
    for (let i = seq - 3; i <= seq + 3; i++) {
      if (i > 0 && !errorSequences.has(i)) adjacentSequences.add(i);
    }
  }

  const adjacentEvents = events.filter(e => adjacentSequences.has(e.sequence));
  const selectedSet = new Set([...errors.map(e => e.sequence), ...adjacentEvents.map(e => e.sequence)]);
  
  const remainingBudget = 200 - selectedSet.size;
  const otherEvents = events
    .filter(e => !selectedSet.has(e.sequence))
    .slice(-Math.max(0, remainingBudget));

  const selected = [...errors, ...adjacentEvents, ...otherEvents]
    .filter((e, i, arr) => arr.findIndex(x => x.sequence === e.sequence) === i)
    .sort((a, b) => a.sequence - b.sequence)
    .slice(0, 200);

  // Generate snapshot cursor
  const snapshotCursor = throughParam || createSnapshotCursor(signer, sessionId, throughSequence, capturedAt, params);

  // Truncate data previews for context
  const contextEvents = selected.map(e => {
    const preview = { ...e };
    if (preview.data) {
      const dataStr = JSON.stringify(preview.data);
      if (dataStr.length > 1024) {
        preview.data = { _preview: dataStr.slice(0, 512) + '...', _entryId: preview.entryId };
      }
    }
    return preview;
  });

  // Count by type
  const typeCounts = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }

  const selectedTypeCounts = {};
  for (const e of selected) {
    selectedTypeCounts[e.type] = (selectedTypeCounts[e.type] || 0) + 1;
  }

  sendJson(res, 200, {
    ok: true,
    sessionId,
    device: info.device,
    connectionState: info.connectionState,
    syncState: info.syncState,
    truncated: info.truncated,
    snapshotCursor,
    throughSequence,
    capturedAt,
    window: { since: new Date(sinceMs).toISOString(), until: new Date(untilMs).toISOString() },
    events: contextEvents,
    selection: {
      total: events.length,
      selected: selected.length,
      omitted: events.length - selected.length,
      byType: selectedTypeCounts,
      totalByType: typeCounts,
    },
    lastManualSyncAt: session.getLastManualSyncAt(),
  });
}

function handleInspect(req, res, hub, appId, sessionId, entryId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');
  if (!isValidSessionId(sessionId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');

  // Validate entryId format: sessionId:sequence
  const parts = entryId.split(':');
  if (parts.length !== 2) return sendError(res, 'INVALID_ARGUMENT', 'Invalid entryId format');
  const entrySessionId = parts[0];
  const sequence = parseInt(parts[1], 10);
  if (entrySessionId !== sessionId) {
    return sendError(res, 'INVALID_ARGUMENT', 'entryId session does not match path session');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    return sendError(res, 'INVALID_ARGUMENT', 'Invalid sequence in entryId');
  }

  const session = hub.getSession(sessionId);
  if (!session) return sendError(res, 'NO_SESSION', 'Session not found');

  const event = session.getEvent(sequence);
  if (!event) return sendError(res, 'ENTRY_NOT_FOUND', 'Entry not found');

  sendJson(res, 200, {
    ok: true,
    contentTrust: 'untrusted',
    event,
  });
}

function handleQueryEvents(req, res, hub, appId, sessionId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');
  if (!isValidSessionId(sessionId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');

  const session = hub.getSession(sessionId);
  if (!session) return sendError(res, 'NO_SESSION', 'Session not found');

  const info = session.getSessionInfo();
  if (info.appId !== appId) return sendError(res, 'INVALID_ARGUMENT', 'Session does not belong to this appId');

  const url = new URL(req.url || '/', 'http://localhost');
  const signer = hub.getCursorSigner();
  
  let fromSequence;
  const cursorParam = url.searchParams.get('cursor');
  if (cursorParam) {
    const parsed = parseCursor(signer, cursorParam, sessionId);
    if (!parsed.valid) return sendError(res, parsed.code, 'Invalid cursor');
    fromSequence = parsed.payload.sequence;
  }

  const result = session.queryEvents({
    since: url.searchParams.get('since'),
    until: url.searchParams.get('until'),
    type: url.searchParams.get('type'),
    severity: url.searchParams.get('severity'),
    text: url.searchParams.get('text'),
    limit: parseInt(url.searchParams.get('limit') || '200', 10),
    cursor: fromSequence,
  });

  const nextCursor = result.nextSequence !== undefined
    ? createEventCursor(signer, sessionId, result.nextSequence)
    : null;

  sendJson(res, 200, {
    ok: true,
    events: result.events,
    nextCursor,
    hasMore: result.hasMore,
    total: result.total,
  });
}

function handleStream(req, res, hub, appId, sessionId) {
  if (!isValidAppId(appId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid appId');
  if (!isValidSessionId(sessionId)) return sendError(res, 'INVALID_ARGUMENT', 'Invalid sessionId');

  const session = hub.getSession(sessionId);
  if (!session) return sendError(res, 'NO_SESSION', 'Session not found');

  const info = session.getSessionInfo();
  if (info.appId !== appId) return sendError(res, 'INVALID_ARGUMENT', 'Session does not belong to this appId');

  const signer = hub.getCursorSigner();
  
  // Parse cursor from Last-Event-ID or query
  const url = new URL(req.url || '/', 'http://localhost');
  const lastEventId = req.headers['last-event-id'];
  const cursorParam = lastEventId || url.searchParams.get('cursor');
  let fromSequence = info.ackThrough;
  
  if (cursorParam) {
    const parsed = parseCursor(signer, cursorParam, sessionId);
    if (!parsed.valid) return sendError(res, parsed.code, 'Invalid cursor');
    fromSequence = parsed.payload.sequence;
  }

  // SSE headers
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
  });

  let bufferBytes = 0;
  const maxBuffer = 512 * 1024;
  let replaying = true;
  let lastEmittedSequence = fromSequence;
  const replayBuffer = [];
  const emit = (envelope) => {
    if (envelope.sequence <= lastEmittedSequence) return;
    lastEmittedSequence = envelope.sequence;
    const cursor = createEventCursor(signer, sessionId, envelope.sequence);
    const data = JSON.stringify(envelope);
    const chunk = `id: ${cursor}\nevent: event\ndata: ${data}\n\n`;
    bufferBytes += Buffer.byteLength(chunk);
    if (bufferBytes > maxBuffer) {
      removeListener();
      res.end();
      return;
    }
    try { res.write(chunk); } catch { removeListener(); }
  };

  // Register before replay. Events that arrive during replay are buffered and
  // emitted afterwards in sequence order, closing the replay/live gap.
  const removeListener = session.addListener((envelopes) => {
    for (const envelope of envelopes) {
      if (envelope.sequence <= fromSequence) continue;
      if (replaying) replayBuffer.push(envelope);
      else emit(envelope);
    }
  });

  const replay = session.queryEvents({ cursor: fromSequence, limit: 200 });
  for (const event of replay.events) emit(event);
  replaying = false;
  replayBuffer.sort((a, b) => a.sequence - b.sequence).forEach(emit);

  // Keepalive
  const keepalive = setInterval(() => {
    try { res.write(':keepalive\n\n'); }
    catch { clearInterval(keepalive); removeListener(); }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
    removeListener();
  });
}

module.exports = {
  handleHealth, handleReady,
  handleSessionOpen, handleEvents, handleHeartbeat,
  handleSessionsList, handleContext, handleInspect,
  handleQueryEvents, handleStream,
};
