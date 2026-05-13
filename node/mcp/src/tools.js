'use strict';

const { getDaemonOrigin, readSession, readSessions } = require('./daemonClient');
const { KNOWN_LOG_TYPES, createToolPayload } = require('./logs');

const getAppLogsTool = {
  name: 'get_app_logs',
  description: 'Read React Native Debug Toolkit logs from the local daemon. Tip: if you have shell access, curl http://127.0.0.1:3799/sessions/latest is more efficient.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      logType: {
        type: 'string',
        enum: KNOWN_LOG_TYPES,
      },
      limit: { type: 'number', default: 50 },
      failedOnly: { type: 'boolean', default: false },
      includeBodies: { type: 'boolean', default: true },
    },
  },
};

const listAppSessionsTool = {
  name: 'list_app_sessions',
  description: 'List React Native Debug Toolkit sessions available in the local daemon. Tip: if you have shell access, curl http://127.0.0.1:3799/sessions is more efficient.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const tools = [getAppLogsTool, listAppSessionsTool];

async function callTool(name, args = {}, context = {}) {
  const ensureDaemon = context.ensureDaemon || (async () => ({ ok: true, origin: getDaemonOrigin() }));
  const daemon = await ensureDaemon();
  if (!daemon.ok) {
    return {
      ok: false,
      error: daemon.error || 'Debug toolkit daemon is not available',
      origin: daemon.origin,
    };
  }

  try {
    if (name === listAppSessionsTool.name) {
      const readSessionsImpl = context.readSessions || readSessions;
      const result = await readSessionsImpl(daemon.origin);
      const sessions = Array.isArray(result.sessions) ? result.sessions : [];
      return {
        ok: true,
        origin: daemon.origin,
        sessions,
        count: sessions.length,
      };
    }

    if (name !== getAppLogsTool.name) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const session = await readSession(daemon.origin, args.sessionId);
    return createToolPayload(session, {
      logType: args.logType,
      limit: args.limit,
      failedOnly: args.failedOnly,
      includeBodies: args.includeBodies,
    });
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Failed to read debug toolkit logs',
      origin: daemon.origin,
    };
  }
}

module.exports = {
  callTool,
  getAppLogsTool,
  listAppSessionsTool,
  tools,
};
