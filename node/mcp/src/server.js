'use strict';

const {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} = require('./constants');
const { callTool, tools } = require('./tools');

function writeMessage(output, message) {
  output.write(`${JSON.stringify(message)}\n`);
}

function createError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

async function handleMessage(message, context) {
  const id = message.id;
  const method = message.method;

  if (!method) {
    return null;
  }

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
        },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'ping') {
    return {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools,
      },
    };
  }

  if (method === 'tools/call') {
    try {
      const result = await callTool(
        message.params?.name,
        message.params?.arguments || {},
        context,
      );
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } catch (error) {
      return createError(id, -32000, error.message || 'Tool call failed');
    }
  }

  if (id === undefined) {
    return null;
  }

  return createError(id, -32601, `Method not found: ${method}`);
}

function startStdioServer(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const errorOutput = options.errorOutput || process.stderr;
  const context = options.context || {};
  let buffer = '';

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      let message;
      try {
        message = JSON.parse(trimmed);
      } catch (error) {
        errorOutput.write(`Invalid MCP JSON message: ${error.message}\n`);
        return;
      }

      handleMessage(message, context)
        .then((response) => {
          if (response) {
            writeMessage(output, response);
          }
        })
        .catch((error) => {
          if (message.id !== undefined) {
            writeMessage(output, createError(message.id, -32000, error.message || 'MCP error'));
          } else {
            errorOutput.write(`MCP notification failed: ${error.message}\n`);
          }
        });
    });
  });
}

module.exports = {
  handleMessage,
  startStdioServer,
};
