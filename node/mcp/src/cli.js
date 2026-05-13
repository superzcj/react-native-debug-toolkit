'use strict';

const { ensureDaemon } = require('./daemonClient');
const { startStdioServer } = require('./server');

function startMcpFromCli() {
  let daemonPromise;

  const ensureDaemonOnce = () => {
    if (!daemonPromise) {
      daemonPromise = ensureDaemon();
      daemonPromise.then((result) => {
        if (!result.ok) {
          process.stderr.write(`Debug toolkit daemon unavailable: ${result.error}\n`);
        }
      });
    }
    return daemonPromise;
  };

  ensureDaemonOnce();
  startStdioServer({
    context: {
      ensureDaemon: ensureDaemonOnce,
    },
  });
}

module.exports = {
  startMcpFromCli,
};
