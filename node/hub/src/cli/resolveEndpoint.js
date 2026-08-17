'use strict';

const { normalizeEndpoint } = require('../protocol/validation');

const LOCAL_HUB_ENDPOINT = 'http://127.0.0.1:3800';
const HUB_READY_NAME = 'react-native-debug-toolkit-hub';
const HUB_PROTOCOL_VERSION = 1;
const READY_TIMEOUT_MS = 800;
const defaultFetch = typeof fetch === 'function' ? fetch : null;

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

function normalizeLocalEndpoint(value) {
  const normalized = normalizeEndpoint(value || '');
  if (!normalized) {
    return LOCAL_HUB_ENDPOINT;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return LOCAL_HUB_ENDPOINT;
    }
    return normalized;
  } catch (_err) {
    return LOCAL_HUB_ENDPOINT;
  }
}

async function fetchWithReadyTimeout(endpoint, fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation missing');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), READY_TIMEOUT_MS)
    : null;
  try {
    return await fetchImpl(`${endpoint}/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeHubReady(endpoint, fetchImpl = defaultFetch) {
  try {
    const response = await fetchWithReadyTimeout(endpoint, fetchImpl);
    let payload = null;
    try {
      payload = await response.json();
    } catch (_err) {
      payload = null;
    }
    if (!response.ok) {
      return {
        endpoint,
        kind: 'not_ready',
        httpStatus: response.status,
        payload,
        error: null,
      };
    }
    return {
      endpoint,
      kind: isCompatibleHubReadyPayload(payload) ? 'compatible' : 'incompatible',
      httpStatus: response.status,
      payload,
      error: null,
    };
  } catch (error) {
    return {
      endpoint,
      kind: 'unreachable',
      httpStatus: null,
      payload: null,
      error: error && error.message ? error.message : 'unreachable',
    };
  }
}

async function defaultProbeReady(endpoint, fetchImpl = defaultFetch) {
  const result = await probeHubReady(endpoint, fetchImpl);
  if (result.kind === 'compatible') {
    return result.payload;
  }
  return null;
}

function buildCandidateList(options = {}) {
  const candidates = [];
  const explicit = normalizeEndpoint(options.explicitEndpoint || '');
  if (explicit) {
    pushUnique(candidates, explicit);
    return { explicit: true, candidates };
  }
  pushUnique(candidates, normalizeLocalEndpoint(options.localEndpoint));
  const project = normalizeEndpoint(options.projectEndpoint || '');
  pushUnique(candidates, project);
  return { explicit: false, candidates };
}

async function resolveCliHubCandidates(options = {}) {
  const { explicit, candidates } = buildCandidateList(options);
  const fetchImpl = options.fetchImpl || defaultFetch;
  const probe = options.probeHubReady
    || ((endpoint) => probeHubReady(endpoint, fetchImpl));
  const results = await Promise.all(candidates.map((endpoint) => probe(endpoint)));
  return {
    explicit,
    attempted: candidates.slice(),
    results,
  };
}

async function resolveCliHubEndpoint(options = {}) {
  const probeReady = options.probeReady || defaultProbeReady;
  const attempted = [];
  const { candidates } = buildCandidateList(options);

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
  resolveCliHubCandidates,
  probeHubReady,
  isCompatibleHubReadyPayload,
  LOCAL_HUB_ENDPOINT,
  defaultProbeReady,
};
