'use strict';

const { hubGet, apiPath } = require('../httpClient');
const { getExitCode } = require('../../protocol/errors');

async function contextCommand(options) {
  const { endpoint, appId, session: sessionId, allowStale, through, since, until } = options;

  // Resolve session
  const resolvedSession = await resolveSession(endpoint, appId, sessionId, allowStale);
  if (!resolvedSession.ok) return resolvedSession;

  const sid = resolvedSession.sessionId;
  let queryPath = apiPath(appId, 'sessions', sid, 'context');
  const params = new URLSearchParams();
  if (through) params.set('through', through);
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  const qs = params.toString();
  if (qs) queryPath += `?${qs}`;

  let result;
  try {
    result = await hubGet(endpoint, queryPath, 30000);
  } catch (err) {
    return { ok: false, code: 'HUB_UNREACHABLE', message: err.message, exitCode: getExitCode('HUB_UNREACHABLE') };
  }

  if (!result.body?.ok) {
    const code = result.body?.error?.code || 'INTERNAL_ERROR';
    return {
      ok: false,
      code,
      message: result.body?.error?.message || 'Context query failed',
      exitCode: getExitCode(code),
    };
  }

  return { ok: true, ...result.body, exitCode: 0 };
}

async function resolveSession(endpoint, appId, sessionId, allowStale) {
  if (sessionId) {
    let result;
    try {
      result = await hubGet(endpoint, apiPath(appId, 'sessions'), 10000);
    } catch (err) {
      return { ok: false, code: 'HUB_UNREACHABLE', message: err.message, exitCode: getExitCode('HUB_UNREACHABLE') };
    }
    const session = (result.body?.sessions || []).find(item => item.sessionId === sessionId);
    if (!session) {
      return { ok: false, code: 'NO_SESSION', message: 'Session not found for this app.', exitCode: getExitCode('NO_SESSION') };
    }
    if (session.connectionState !== 'active' && !allowStale) {
      return { ok: false, code: 'STALE_SESSION', message: 'Session is stale. Pass --allow-stale to read it.', exitCode: getExitCode('STALE_SESSION') };
    }
    return { ok: true, sessionId };
  }

  // Auto-select: list sessions
  let result;
  try {
    result = await hubGet(endpoint, apiPath(appId, 'sessions'), 10000);
  } catch (err) {
    return { ok: false, code: 'HUB_UNREACHABLE', message: err.message, exitCode: getExitCode('HUB_UNREACHABLE') };
  }

  const sessions = result.body?.sessions || [];
  if (sessions.length === 0) {
    return {
      ok: false,
      code: 'NO_SESSION',
      message: 'No retained session was found for this app.',
      suggestedAction: 'Open the test app and reproduce the issue.',
      exitCode: getExitCode('NO_SESSION'),
    };
  }

  const active = sessions.filter(s => s.connectionState === 'active');
  if (active.length === 1) {
    if (active[0].syncState === 'paused') {
      // Warn but allow
      return {
        ok: true,
        sessionId: active[0].sessionId,
        warnings: ['Session sync is paused. Logs since pause may be incomplete.'],
      };
    }
    return { ok: true, sessionId: active[0].sessionId };
  }

  if (active.length > 1) {
    return {
      ok: false,
      code: 'MULTIPLE_ACTIVE_SESSIONS',
      message: `${active.length} active sessions found. Specify --session.`,
      candidates: active.slice(0, 10),
      exitCode: getExitCode('MULTIPLE_ACTIVE_SESSIONS'),
    };
  }

  // No active, all stale
  if (!allowStale) {
    return {
      ok: false,
      code: 'APP_OFFLINE',
      message: 'No active session. Use --session with --allow-stale to read stale data.',
      candidates: sessions.slice(0, 10),
      exitCode: getExitCode('APP_OFFLINE'),
    };
  }

  return { ok: true, sessionId: sessions[0].sessionId };
}

module.exports = { contextCommand, resolveSession };
