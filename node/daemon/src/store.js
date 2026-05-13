'use strict';

const DEFAULT_MAX_SESSIONS = 20;

function createLogCount(report) {
  const logs = report && typeof report === 'object' ? report.logs : undefined;
  if (!logs || typeof logs !== 'object') {
    return {};
  }

  return Object.entries(logs).reduce((acc, [type, entries]) => {
    if (Array.isArray(entries)) {
      acc[type] = entries.length;
    }
    return acc;
  }, {});
}

function createSessionId(now, sequence) {
  return `session_${now}_${sequence}`;
}

function createMemoryStore(options = {}) {
  const maxSessions = options.maxSessions || DEFAULT_MAX_SESSIONS;
  const onUpdate = options.onUpdate || null;
  const sessions = [];
  let sequence = 0;

  function saveReport(report) {
    const now = Date.now();
    sequence += 1;

    const session = {
      sessionId: typeof report.sessionId === 'string' && report.sessionId
        ? report.sessionId
        : createSessionId(now, sequence),
      receivedAt: new Date(now).toISOString(),
      report,
      logCount: createLogCount(report),
    };

    const existingIndex = sessions.findIndex((item) => item.sessionId === session.sessionId);
    if (existingIndex >= 0) {
      sessions.splice(existingIndex, 1);
    }

    sessions.push(session);
    while (sessions.length > maxSessions) {
      sessions.shift();
    }

    if (onUpdate) onUpdate(session, 'full');
    return session;
  }

  function appendLogs(sessionId, delta) {
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return null;

    const deltaLogs = (delta && delta.logs) || {};
    Object.entries(deltaLogs).forEach(([type, entries]) => {
      if (!Array.isArray(entries)) return;
      if (!session.report.logs[type]) {
        session.report.logs[type] = [];
      }
      session.report.logs[type].push(...entries);
    });

    session.logCount = createLogCount(session.report);
    if (onUpdate) onUpdate(session, 'delta', delta);
    return session;
  }

  function listSessions() {
    return sessions
      .slice()
      .reverse()
      .map((session) => ({
        sessionId: session.sessionId,
        receivedAt: session.receivedAt,
        logCount: session.logCount,
      }));
  }

  function getLatestSession() {
    return sessions[sessions.length - 1] || null;
  }

  function getSession(sessionId) {
    return sessions.find((session) => session.sessionId === sessionId) || null;
  }

  function clear() {
    sessions.splice(0, sessions.length);
  }

  return {
    appendLogs,
    clear,
    getLatestSession,
    getSession,
    listSessions,
    saveReport,
  };
}

module.exports = {
  createLogCount,
  createMemoryStore,
};
