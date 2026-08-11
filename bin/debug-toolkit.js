#!/usr/bin/env node

'use strict';

const args = process.argv.slice(2);
const command = args[0] || '';

// v4: Route all commands through the new Hub CLI
// Old v3 commands (--daemon-only, /report, /ingest) are removed

if (command === 'mcp') {
  // MCP stdio adapter with fixed endpoint/appId
  const { startMcpStdioServer } = require('../node/hub/src/mcp/server');

  function readOption(a, name, fallback) {
    const idx = a.indexOf(name);
    return idx >= 0 && idx < a.length - 1 ? a[idx + 1] : fallback;
  }

  const endpoint = readOption(args, '--endpoint', process.env.DEBUG_TOOLKIT_HUB_ENDPOINT);
  const appId = readOption(args, '--app-id', process.env.DEBUG_TOOLKIT_APP_ID);

  if (!endpoint) {
    process.stderr.write('--endpoint is required for MCP adapter (or set DEBUG_TOOLKIT_HUB_ENDPOINT)\n');
    process.exitCode = 2;
  } else if (!appId) {
    process.stderr.write('--app-id is required for MCP adapter (or set DEBUG_TOOLKIT_APP_ID)\n');
    process.exitCode = 2;
  } else {
    startMcpStdioServer({ endpoint, appId });
  }
} else {
  // All other commands go through the unified CLI
  const { main } = require('../node/hub/src/cli/main');

  main(args)
    .then((result) => {
      if (result && typeof result.exitCode === 'number') {
        process.exitCode = result.exitCode;
      }
    })
    .catch((error) => {
      process.stderr.write(`Fatal: ${error.message}\n`);
      process.exitCode = 1;
    });
}
