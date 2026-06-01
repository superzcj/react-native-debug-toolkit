const { runBundleCli } = require('../../../scripts/bundle/cli');

function createIo() {
  return {
    stdout: '',
    stderr: '',
    writeOut(value) {
      this.stdout += value;
    },
    writeErr(value) {
      this.stderr += value;
    },
  };
}

describe('bundle cli', () => {
  it('routes setup-bundle', async () => {
    const io = createIo();
    const calls = [];

    const code = await runBundleCli(['setup-bundle', '--platform', 'ios', '--check'], {
      cwd: '/app',
      io,
      setupBundle: async (options) => calls.push(options),
    });

    expect(code).toBe(0);
    expect(calls).toEqual([
      expect.objectContaining({ cwd: '/app', platform: 'ios', check: true, undo: false }),
    ]);
  });

  it('routes doctor-bundle', async () => {
    const io = createIo();
    const calls = [];

    const code = await runBundleCli(['doctor-bundle', '--platform', 'android', '--apk', '/tmp/app.apk'], {
      cwd: '/app',
      io,
      doctorBundle: async (options) => calls.push(options),
    });

    expect(code).toBe(0);
    expect(calls).toEqual([
      expect.objectContaining({ platform: 'android', apk: '/tmp/app.apk' }),
    ]);
  });

  it('prints doctor-bundle results', async () => {
    const io = createIo();

    const code = await runBundleCli(['doctor-bundle', '--platform', 'ios'], {
      cwd: '/app',
      io,
      doctorBundle: async () => ({ ok: true, platform: 'ios', mode: 'config', file: '/app/ios/App.xcodeproj/project.pbxproj' }),
    });

    expect(code).toBe(0);
    expect(io.stdout).toContain('doctor-bundle ok: ios config');
    expect(io.stdout).toContain('/app/ios/App.xcodeproj/project.pbxproj');
  });

  it('rejects old embed command without compat alias', async () => {
    const io = createIo();

    const code = await runBundleCli(['embed'], { cwd: '/app', io });

    expect(code).toBe(1);
    expect(io.stderr).toContain('Unknown command: embed');
    expect(io.stderr).toContain('Use: debug-toolkit setup-bundle');
  });
});
