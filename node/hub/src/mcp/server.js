'use strict';

const { HUB_NAME, HUB_VERSION } = require('../protocol/constants');
const { createMcpAdapter } = require('./adapter');

function createMcpError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function startMcpStdioServer(options) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const errOutput = options.errorOutput || process.stderr;
  
  const adapter = createMcpAdapter({
    endpoint: options.endpoint,
    appId: options.appId,
  });

  let buffer = '';

  function writeMessage(message) {
    output.write(JSON.stringify(message) + '\n');
  }

  async function handleMessage(message) {
    const id = message.id;
    const method = message.method;

    if (!method) return null;

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: message.params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: `${HUB_NAME}-mcp`, version: HUB_VERSION },
        },
      };
    }

    if (method === 'notifications/initialized') return null;
    if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: adapter.tools } };
    }

    if (method === 'tools/call') {
      const result = await adapter.callTool(
        message.params?.name,
        message.params?.arguments || {},
      );
      
      if (result.isError) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            structuredContent: result.structuredContent,
            content: [{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }],
          },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        },
      };
    }

    if (id !== undefined) {
      return createMcpError(id, -32601, `Method not found: ${method}`);
    }
    return null;
  }

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let message;
      try { message = JSON.parse(trimmed); }
      catch (e) { errOutput.write(`Invalid JSON: ${e.message}\n`); continue; }

      handleMessage(message)
        .then((response) => { if (response) writeMessage(response); })
        .catch((error) => {
          if (message.id !== undefined) {
            writeMessage(createMcpError(message.id, -32000, error.message));
          }
        });
    }
  });
}

module.exports = { startMcpStdioServer };
