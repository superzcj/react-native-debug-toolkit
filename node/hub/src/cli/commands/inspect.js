'use strict';

const { hubGet, apiPath } = require('../httpClient');
const { getExitCode } = require('../../protocol/errors');

async function inspectCommand(options) {
  const { endpoint, appId, entryId } = options;

  // Parse entryId → sessionId:sequence
  const colonIdx = entryId.lastIndexOf(':');
  if (colonIdx < 0) {
    return { ok: false, code: 'INVALID_ARGUMENT', message: 'Invalid entryId format. Expected sessionId:sequence', exitCode: 2 };
  }
  const sessionId = entryId.slice(0, colonIdx);
  const sequence = entryId.slice(colonIdx + 1);

  const queryPath = apiPath(appId, 'sessions', sessionId, 'entries', entryId);
  let result;
  try {
    result = await hubGet(endpoint, queryPath, 15000);
  } catch (err) {
    return { ok: false, code: 'HUB_UNREACHABLE', message: err.message, exitCode: getExitCode('HUB_UNREACHABLE') };
  }

  if (!result.body?.ok) {
    const code = result.body?.error?.code || 'INTERNAL_ERROR';
    return {
      ok: false,
      code,
      message: result.body?.error?.message || 'Inspect failed',
      exitCode: getExitCode(code),
    };
  }

  return { ok: true, ...result.body, exitCode: 0 };
}

module.exports = { inspectCommand };
