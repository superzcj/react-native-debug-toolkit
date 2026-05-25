'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_DEVICES = 20;

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

function slugPart(value) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function ipTail(ip) {
  if (!ip || typeof ip !== 'string') return '0';
  const parts = ip.split('.');
  return parts.length >= 2 ? parts[parts.length - 1] : slugPart(ip);
}

function isSimulatorIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '10.0.2.2' || ip === 'localhost';
}

function createDeviceId(report, source) {
  const device = report && typeof report === 'object' && report.device && typeof report.device === 'object'
    ? report.device
    : {};
  const platform = slugPart(device.platform);
  const ip = source && source.ip ? String(source.ip) : '';
  const sim = isSimulatorIp(ip);
  let model = slugPart(device.model);
  if (model === 'unknown' && platform !== 'unknown') {
    model = sim ? 'sim' : 'device';
  }
  const ver = device.appVersion ? slugPart(device.appVersion) : '';
  const tail = sim ? 'sim' : ipTail(ip);
  const parts = [platform, model];
  if (ver && ver !== 'unknown') parts.push(ver);
  parts.push(tail);
  return parts.join('_');
}

function readPersistedDevices(storagePath, maxDevices) {
  if (!storagePath) {
    return [];
  }

  try {
    const raw = fs.readFileSync(storagePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((deviceLog) => (
        deviceLog &&
        typeof deviceLog === 'object' &&
        typeof deviceLog.deviceId === 'string' &&
        deviceLog.report &&
        typeof deviceLog.report === 'object'
      ))
      .slice(-maxDevices);
  } catch {
    return [];
  }
}

function createMemoryStore(options = {}) {
  const maxDevices = options.maxDevices || DEFAULT_MAX_DEVICES;
  const onUpdate = options.onUpdate || null;
  const storagePath = options.storagePath || null;
  const devices = readPersistedDevices(storagePath, maxDevices);

  function persist() {
    if (!storagePath) {
      return;
    }

    try {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
      const tmpPath = `${storagePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(devices, null, 2));
      fs.renameSync(tmpPath, storagePath);
    } catch {
      // Persistence is best-effort; daemon HTTP API should keep working.
    }
  }

  function saveReport(report, metadata = {}) {
    const now = Date.now();
    const receivedAt = new Date(now).toISOString();
    const source = metadata.source || null;
    const deviceId = createDeviceId(report, source);
    const existingIndex = devices.findIndex((item) => item.deviceId === deviceId);
    const existing = existingIndex >= 0 ? devices[existingIndex] : null;
    const reportSessionId = report.session ? report.session.id : null;
    if (reportSessionId && report.logs) {
      Object.entries(report.logs).forEach(function(pair) {
        if (!Array.isArray(pair[1])) return;
        report.logs[pair[0]] = pair[1].map(function(entry) {
          if (entry && typeof entry === 'object' && !entry.sessionId) {
            return Object.assign({}, entry, { sessionId: reportSessionId });
          }
          return entry;
        });
      });
    }
    const deviceLog = {
      deviceId,
      firstSeenAt: existing ? existing.firstSeenAt : receivedAt,
      lastSeenAt: receivedAt,
      receivedAt,
      source,
      device: report.device || null,
      session: report.session || null,
      report,
      logCount: createLogCount(report),
    };

    if (existingIndex >= 0) {
      devices.splice(existingIndex, 1);
    }

    devices.push(deviceLog);
    while (devices.length > maxDevices) {
      devices.shift();
    }

    persist();
    if (onUpdate) onUpdate(deviceLog, 'full');
    return deviceLog;
  }

  function appendLogs(deviceId, delta) {
    const deviceLog = devices.find((item) => item.deviceId === deviceId);
    if (!deviceLog) {
      return null;
    }

    const deltaLogs = (delta && delta.logs) || {};
    const currentSessionId = deviceLog.session ? deviceLog.session.id : null;
    Object.entries(deltaLogs).forEach(([type, entries]) => {
      if (!Array.isArray(entries)) {
        return;
      }
      if (!deviceLog.report.logs[type]) {
        deviceLog.report.logs[type] = [];
      }
      const tagged = entries.map(function(entry) {
        if (entry && typeof entry === 'object' && currentSessionId && !entry.sessionId) {
          return Object.assign({}, entry, { sessionId: currentSessionId });
        }
        return entry;
      });
      deviceLog.report.logs[type].push(...tagged);
    });

    deviceLog.lastSeenAt = new Date(Date.now()).toISOString();
    deviceLog.receivedAt = deviceLog.lastSeenAt;
    deviceLog.logCount = createLogCount(deviceLog.report);
    persist();
    if (onUpdate) onUpdate(deviceLog, 'delta', delta);
    return deviceLog;
  }

  function listDevices() {
    return devices
      .slice()
      .reverse()
      .map((deviceLog) => ({
        deviceId: deviceLog.deviceId,
        firstSeenAt: deviceLog.firstSeenAt,
        lastSeenAt: deviceLog.lastSeenAt,
        receivedAt: deviceLog.receivedAt,
        device: deviceLog.device || null,
        source: deviceLog.source || null,
        session: deviceLog.session || null,
        logCount: deviceLog.logCount,
      }));
  }

  function getLatestDevice() {
    return devices[devices.length - 1] || null;
  }

  function getDevice(deviceId) {
    return devices.find((deviceLog) => deviceLog.deviceId === deviceId) || null;
  }

  function clear() {
    devices.splice(0, devices.length);
    persist();
  }

  return {
    appendLogs,
    clear,
    getDevice,
    getLatestDevice,
    listDevices,
    saveReport,
  };
}

module.exports = {
  createDeviceId,
  createLogCount,
  createMemoryStore,
};
