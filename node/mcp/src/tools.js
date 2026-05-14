'use strict';

const { getDaemonOrigin, readDevice, readDevices } = require('./daemonClient');
const { KNOWN_LOG_TYPES, createToolPayload } = require('./logs');

const getAppLogsTool = {
  name: 'get_app_logs',
  description: 'Read React Native Debug Toolkit logs from the local daemon. Tip: if you have shell access, curl http://127.0.0.1:3799/devices/latest is more efficient.',
  inputSchema: {
    type: 'object',
    properties: {
      deviceId: { type: 'string' },
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

const listAppDevicesTool = {
  name: 'list_app_devices',
  description: 'List React Native Debug Toolkit devices available in the local daemon. Tip: if you have shell access, curl http://127.0.0.1:3799/devices is more efficient.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const tools = [getAppLogsTool, listAppDevicesTool];

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
    if (name === listAppDevicesTool.name) {
      const readDevicesImpl = context.readDevices || readDevices;
      const result = await readDevicesImpl(daemon.origin);
      const devices = Array.isArray(result.devices) ? result.devices : [];
      return {
        ok: true,
        origin: daemon.origin,
        devices,
        count: devices.length,
      };
    }

    if (name !== getAppLogsTool.name) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const device = await readDevice(daemon.origin, args.deviceId);
    return createToolPayload(device, {
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
  listAppDevicesTool,
  tools,
};
