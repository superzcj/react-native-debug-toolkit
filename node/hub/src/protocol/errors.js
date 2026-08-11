'use strict';

const ERROR_DEFS = {
  INVALID_ARGUMENT: { http: 400, exit: 2 },
  INVALID_CONFIG: { http: 400, exit: 2 },
  CURSOR_INVALID: { http: 400, exit: 2 },
  TOOLKIT_NOT_INSTALLED: { http: null, exit: 2 },
  HUB_UNREACHABLE: { http: null, exit: 4 },
  HUB_NOT_READY: { http: 503, exit: 4 },
  NO_SESSION: { http: 404, exit: 3 },
  APP_OFFLINE: { http: 409, exit: 3 },
  STALE_SESSION: { http: 409, exit: 3 },
  MULTIPLE_ACTIVE_SESSIONS: { http: 409, exit: 3 },
  ENTRY_NOT_FOUND: { http: 404, exit: 3 },
  SESSION_EXPIRED: { http: 410, exit: 3 },
  CURSOR_EXPIRED: { http: 410, exit: 3 },
  ENTRY_EXPIRED: { http: 410, exit: 3 },
  PROTOCOL_MISMATCH: { http: 426, exit: 4 },
  TIMEOUT: { http: 504, exit: 4 },
  STALE_GENERATION: { http: 409, exit: 4 },
  PAYLOAD_HASH_MISMATCH: { http: 409, exit: 5 },
  SEQUENCE_CONFLICT: { http: 409, exit: 5 },
  SESSION_METADATA_CONFLICT: { http: 409, exit: 5 },
  SESSION_ID_CONFLICT: { http: 409, exit: 5 },
  APP_ID_CONFLICT: { http: 409, exit: 5 },
  STORAGE_FULL: { http: 507, exit: 5 },
  INTERNAL_ERROR: { http: 500, exit: 5 },
};

function createErrorResponse(code, message, details, suggestedAction) {
  const def = ERROR_DEFS[code];
  if (!def) throw new Error(`Unknown error code: ${code}`);
  return {
    ok: false,
    error: {
      code,
      message: message || code,
      suggestedAction: suggestedAction || null,
      details: details || {},
    },
  };
}

function getHttpStatus(code) {
  const def = ERROR_DEFS[code];
  return def ? def.http : 500;
}

function getExitCode(code) {
  const def = ERROR_DEFS[code];
  return def ? def.exit : 5;
}

module.exports = {
  ERROR_DEFS,
  createErrorResponse,
  getHttpStatus,
  getExitCode,
};
