'use strict';

const KNOWN_LOG_TYPES = ['network', 'console', 'navigation', 'track', 'zustand'];

function isFailedLog(entry) {
  return Boolean(
    entry &&
    typeof entry === 'object' &&
    (
      entry.error ||
      entry.level === 'error' ||
      entry.response?.success === false ||
      entry.response?.status >= 400
    ),
  );
}

function stripBodies(value, parentKey) {
  if (Array.isArray(value)) {
    return value.map((item) => stripBodies(item, parentKey));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((acc, [key, child]) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'body' || (parentKey === 'response' && normalizedKey === 'data')) {
      return acc;
    }
    acc[key] = stripBodies(child, normalizedKey);
    return acc;
  }, {});
}

function selectLogs(report, options = {}) {
  const logs = report?.logs && typeof report.logs === 'object' ? report.logs : {};
  const logType = options.logType;
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? Math.min(Math.floor(options.limit), 200)
    : 50;
  const includeBodies = options.includeBodies !== false;
  const failedOnly = options.failedOnly === true;

  let entries;
  if (logType) {
    entries = Array.isArray(logs[logType]) ? logs[logType] : [];
  } else {
    entries = Object.entries(logs).flatMap(([type, typeEntries]) => (
      Array.isArray(typeEntries)
        ? typeEntries.map((entry) => ({ type, entry }))
        : []
    ));
  }

  if (failedOnly) {
    entries = entries.filter((item) => isFailedLog(item.entry || item));
  }

  entries = entries.slice(-limit);

  if (logType) {
    return includeBodies ? entries : entries.map(stripBodies);
  }

  return entries.map((item) => ({
    type: item.type,
    entry: includeBodies ? item.entry : stripBodies(item.entry),
  }));
}

function createToolPayload(session, options = {}) {
  const report = session.report || { version: 2, logs: {} };
  const logs = selectLogs(report, options);

  return {
    ok: true,
    sessionId: session.sessionId,
    receivedAt: session.receivedAt,
    logType: options.logType || 'all',
    failedOnly: options.failedOnly === true,
    includeBodies: options.includeBodies !== false,
    count: logs.length,
    logs,
  };
}

module.exports = {
  KNOWN_LOG_TYPES,
  createToolPayload,
  isFailedLog,
  selectLogs,
  stripBodies,
};
