'use strict';

const { hubGet, apiPath } = require('../httpClient');
const { getExitCode } = require('../../protocol/errors');

async function statusCommand(options) {
  const { endpoint, appId } = options;

  // Check /ready
  let ready;
  try {
    ready = await hubGet(endpoint, '/ready', 5000);
  } catch (err) {
    return {
      ok: false,
      code: 'HUB_UNREACHABLE',
      message: `Cannot reach Hub at ${endpoint}: ${err.message}`,
      exitCode: getExitCode('HUB_UNREACHABLE'),
    };
  }

  if (ready.status === 503 || !ready.body?.ok) {
    return {
      ok: false,
      code: 'HUB_NOT_READY',
      message: 'Hub is not ready',
      hub: ready.body,
      exitCode: getExitCode('HUB_NOT_READY'),
    };
  }

  // List sessions
  let sessions;
  try {
    sessions = await hubGet(endpoint, apiPath(appId, 'sessions'), 10000);
  } catch (err) {
    return {
      ok: false,
      code: 'HUB_UNREACHABLE',
      message: `Failed to list sessions: ${err.message}`,
      exitCode: getExitCode('HUB_UNREACHABLE'),
    };
  }

  const hub = ready.body;
  const sessionData = sessions.body;

  return {
    ok: true,
    hub: {
      hubRef: hub.hubRef,
      version: hub.version,
      protocolVersion: hub.protocolVersion,
      serverTime: hub.serverTime,
      uptime: hub.uptime,
      storageUsageBytes: hub.storageUsageBytes,
      storageFull: hub.storageFull,
    },
    sessions: (sessionData?.sessions || []).map(s => ({
      control: {
        contentTrust: 'trusted-control',
        hubRef: hub.hubRef,
        sessionId: s.sessionId,
        sessionRef: s.sessionRef,
        sourceIp: s.sourceIp || null,
        connectionState: s.connectionState,
        syncState: s.syncState,
        lastSeenAt: s.lastSeenAt,
        lastManualSyncAt: s.lastManualSyncAt || null,
      },
      device: {
        contentTrust: 'untrusted',
        platform: s.device?.platform,
        osVersion: s.device?.osVersion,
        manufacturer: s.device?.manufacturer,
        model: s.device?.model,
        appVersion: s.device?.appVersion,
        buildNumber: s.device?.buildNumber,
      },
      label: formatDeviceLabel(s),
    })),
    total: sessionData?.total || 0,
    omitted: sessionData?.omitted || 0,
    exitCode: 0,
  };
}

function formatDeviceLabel(session) {
  const d = session.device || {};
  const parts = [];
  if (d.platform && d.osVersion) parts.push(`${d.platform} ${d.osVersion}`);
  else if (d.platform) parts.push(d.platform);

  const model = [d.manufacturer, d.model].filter(Boolean).join(' ');
  if (model) parts.push(model);
  if (session.sourceIp) parts.push(session.sourceIp);

  const ver = d.appVersion
    ? (d.buildNumber ? `v${d.appVersion}(${d.buildNumber})` : `v${d.appVersion}`)
    : null;
  if (ver) parts.push(ver);

  if (session.lastSeenAt) {
    const ago = Math.round((Date.now() - new Date(session.lastSeenAt).getTime()) / 1000);
    if (ago < 60) parts.push(`${ago}秒前`);
    else if (ago < 3600) parts.push(`${Math.round(ago / 60)}分钟前`);
    else parts.push(`${Math.round(ago / 3600)}小时前`);
  }

  return parts.join(' · ');
}

module.exports = { statusCommand, formatDeviceLabel };
