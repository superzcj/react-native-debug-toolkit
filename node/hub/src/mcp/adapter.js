'use strict';

const { HUB_NAME, HUB_VERSION, PROTOCOL_VERSION } = require('../protocol/constants');
const { normalizeEndpoint, isValidAppId } = require('../protocol/validation');
const { createErrorResponse, getExitCode } = require('../protocol/errors');
const { hubGet, hubPost, apiPath } = require('../cli/httpClient');

function createMcpAdapter(options) {
  const endpoint = normalizeEndpoint(options.endpoint);
  const appId = options.appId;
  
  if (!endpoint) throw new Error('--endpoint is required');
  if (!isValidAppId(appId)) throw new Error('--app-id is required');

  const tools = [
    {
      name: 'debug_toolkit_status',
      description: 'Check Hub status and list active sessions for the configured App.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max sessions to return (default 50)' },
        },
      },
    },
    {
      name: 'debug_toolkit_context',
      description: 'Read a deterministic evidence snapshot for a session. Returns recent events prioritizing errors.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID. Omit for auto-select.' },
          allowStale: { type: 'boolean', description: 'Allow reading stale sessions' },
          through: { type: 'string', description: 'Snapshot cursor for deterministic replay' },
          since: { type: 'string', description: 'ISO timestamp start' },
          until: { type: 'string', description: 'ISO timestamp end' },
        },
      },
    },
    {
      name: 'debug_toolkit_inspect',
      description: 'Read the complete record for a specific event by entryId.',
      inputSchema: {
        type: 'object',
        properties: {
          entryId: { type: 'string', description: 'Event entry ID (sessionId:sequence)' },
        },
        required: ['entryId'],
      },
    },
    {
      name: 'debug_toolkit_events',
      description: 'Query events with filtering and pagination. No streaming.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          allowStale: { type: 'boolean' },
          cursor: { type: 'string', description: 'Pagination cursor from previous call' },
          since: { type: 'string' },
          until: { type: 'string' },
          type: { type: 'string' },
          severity: { type: 'string' },
          text: { type: 'string' },
          limit: { type: 'number', description: 'Max events (default 100, max 200)' },
        },
      },
    },
  ];

  async function callTool(name, args) {
    try {
      if (name === 'debug_toolkit_status') {
        return await toolStatus(args);
      }
      if (name === 'debug_toolkit_context') {
        return await toolContext(args);
      }
      if (name === 'debug_toolkit_inspect') {
        return await toolInspect(args);
      }
      if (name === 'debug_toolkit_events') {
        return await toolEvents(args);
      }
      return { isError: true, structuredContent: createErrorResponse('INVALID_ARGUMENT', `Unknown tool: ${name}`) };
    } catch (err) {
      return { isError: true, structuredContent: createErrorResponse('INTERNAL_ERROR', err.message) };
    }
  }

  async function toolStatus(args) {
    let ready;
    try {
      ready = await hubGet(endpoint, '/ready', 5000);
    } catch (err) {
      return { isError: true, structuredContent: createErrorResponse('HUB_UNREACHABLE', err.message) };
    }

    if (!ready.body?.ok) {
      return { isError: true, structuredContent: createErrorResponse('HUB_NOT_READY', 'Hub is not ready') };
    }

    const sessions = await hubGet(endpoint, apiPath(appId, 'sessions') + `?limit=${args.limit || 50}`, 10000);
    return {
      hub: ready.body,
      sessions: sessions.body?.sessions || [],
      total: sessions.body?.total || 0,
    };
  }

  async function toolContext(args) {
    const sessionId = args.sessionId || (await resolveSessionForMcp(args.allowStale));
    if (typeof sessionId !== 'string') return sessionId; // error

    const params = new URLSearchParams();
    if (args.through) params.set('through', args.through);
    if (args.since) params.set('since', args.since);
    if (args.until) params.set('until', args.until);
    const qs = params.toString();
    const path = apiPath(appId, 'sessions', sessionId, 'context') + (qs ? `?${qs}` : '');
    
    const result = await hubGet(endpoint, path, 30000);
    if (!result.body?.ok) {
      const code = result.body?.error?.code || 'INTERNAL_ERROR';
      return { isError: true, structuredContent: result.body };
    }
    return result.body;
  }

  async function toolInspect(args) {
    if (!args.entryId) {
      return { isError: true, structuredContent: createErrorResponse('INVALID_ARGUMENT', 'entryId is required') };
    }
    const colonIdx = args.entryId.lastIndexOf(':');
    if (colonIdx < 0) {
      return { isError: true, structuredContent: createErrorResponse('INVALID_ARGUMENT', 'Invalid entryId format') };
    }
    const sessionId = args.entryId.slice(0, colonIdx);
    const path = apiPath(appId, 'sessions', sessionId, 'entries', args.entryId);
    const result = await hubGet(endpoint, path, 15000);
    if (!result.body?.ok) {
      return { isError: true, structuredContent: result.body };
    }
    return result.body;
  }

  async function toolEvents(args) {
    const sessionId = args.sessionId || (await resolveSessionForMcp(args.allowStale));
    if (typeof sessionId !== 'string') return sessionId;

    const params = new URLSearchParams();
    if (args.cursor) params.set('cursor', args.cursor);
    if (args.since) params.set('since', args.since);
    if (args.until) params.set('until', args.until);
    if (args.type) params.set('type', args.type);
    if (args.severity) params.set('severity', args.severity);
    if (args.text) params.set('text', args.text);
    params.set('limit', String(Math.min(args.limit || 100, 200)));
    
    const path = apiPath(appId, 'sessions', sessionId, 'events') + `?${params}`;
    const result = await hubGet(endpoint, path, 15000);
    if (!result.body?.ok) {
      return { isError: true, structuredContent: result.body };
    }
    return {
      events: result.body.events,
      nextCursor: result.body.nextCursor,
      hasMore: result.body.hasMore,
      warnings: [],
    };
  }

  async function resolveSessionForMcp(allowStale) {
    const result = await hubGet(endpoint, apiPath(appId, 'sessions'), 10000);
    const sessions = result.body?.sessions || [];
    if (sessions.length === 0) {
      return { isError: true, structuredContent: createErrorResponse('NO_SESSION', 'No retained session found.', {}, 'Open the test app and reproduce the issue.') };
    }
    const active = sessions.filter(s => s.connectionState === 'active');
    if (active.length === 1) return active[0].sessionId;
    if (active.length > 1) {
      return { isError: true, structuredContent: createErrorResponse('MULTIPLE_ACTIVE_SESSIONS', `${active.length} active sessions. Specify sessionId.`, { candidates: active.slice(0, 10) }) };
    }
    if (!allowStale) {
      return { isError: true, structuredContent: createErrorResponse('APP_OFFLINE', 'No active session. Set allowStale to read stale data.', { candidates: sessions.slice(0, 10) }) };
    }
    return sessions[0].sessionId;
  }

  return { tools, callTool };
}

module.exports = { createMcpAdapter };
