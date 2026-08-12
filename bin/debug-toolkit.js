#!/usr/bin/env node

'use strict';

const args = process.argv.slice(2);

// v4: all commands route through the Hub CLI
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
