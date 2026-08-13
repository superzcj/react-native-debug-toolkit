'use strict';

const { normalizeEndpoint } = require('../protocol/validation');

const LOCAL_HUB_ENDPOINT = 'http://127.0.0.1:3800';
const HUB_READY_NAME = 'react-native-debug-toolkit-hub';
const HUB_PROTOCOL_VERSION = 1;
const READY_TIMEOUT_MS = 800;

function isCompatibleHubReadyPayload(payload) {
  return Boolean(
    payload
    && payload.ok === true
    && payload.name === HUB_READY_NAME
    && payload.protocolVersion === HUB_PROTOCOL_VERSION,
  );
}

function pushUnique(list, endpoint) {
  if (!endpoint) return;
  if (!list.includes(endpoint)) list.push(endpoint);
}

async function defaultProbeReady(endpoint, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') return null;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), READY_TIMEOUT_MS)
    : null;

  try {
    const response = await fetchImpl(`${endpoint}/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
    if (!response || !response.ok) return null;
    const body = await response.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveCliHubEndpoint(options = {}) {
  const probeReady = options.probeReady || defaultProbeReady;
  const attempted = [];
  const candidates = [];

  const explicit = normalizeEndpoint(options.explicitEndpoint || '');
  if (explicit) {
    pushUnique(candidates, explicit);
  } else {
    pushUnique(candidates, LOCAL_HUB_ENDPOINT);
    const project = normalizeEndpoint(options.projectEndpoint || '');
    pushUnique(candidates, project);
  }

  for (const candidate of candidates) {
    attempted.push(candidate);
    try {
      const payload = await probeReady(candidate);
      if (isCompatibleHubReadyPayload(payload)) {
        return { endpoint: candidate, attempted };
      }
    } catch {
      // Continue with remaining candidates.
    }
  }

  return { endpoint: null, attempted };
}

module.exports = {
  resolveCliHubEndpoint,
  isCompatibleHubReadyPayload,
  LOCAL_HUB_ENDPOINT,
  defaultProbeReady,
};
