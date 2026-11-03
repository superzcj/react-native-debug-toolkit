#!/usr/bin/env node

'use strict';

const args = process.argv.slice(2);

if (args[0] === 'hub' && args[1] === 'dev' && process.env.DEBUG_TOOLKIT_HUB_WORKER !== '1') {
  require('../node/hub/src/cli/commands/hubSupervisor').superviseHub(__filename, args);
} else {
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
