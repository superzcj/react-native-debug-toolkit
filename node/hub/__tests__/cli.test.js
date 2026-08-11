'use strict';

const { buildInstallPlan, LABEL, LAUNCH_SHIM_PATH } = require('../src/cli/commands/hubInstall');

describe('Hub system installer', () => {
  it('uses a stable launcher shim and preserves the recorded service identity', () => {
    const plan = buildInstallPlan({
      rootDir: '/tmp/dt-hub',
      bind: '10.20.4.10',
      advertiseUrl: 'http://10.20.4.10:3799',
      identity: { username: 'toolkit', uid: 501, gid: 20 },
    });

    expect(plan.currentPath).toBe('/tmp/dt-hub/current');
    expect(plan.plist).toContain(`<string>${LAUNCH_SHIM_PATH}</string>`);
    expect(plan.plist).toContain(`<string>${LABEL}</string>`);
    expect(plan.plist).toContain('<string>toolkit</string>');
    expect(plan.launcher).toContain('"$ROOT/current/node" "$ROOT/current/hub.js"');
  });
});
