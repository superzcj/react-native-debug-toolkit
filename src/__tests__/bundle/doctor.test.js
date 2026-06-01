const fs = require('fs');
const os = require('os');
const path = require('path');
const { doctorBundle } = require('../../../scripts/bundle/doctor');

describe('doctor-bundle', () => {
  it('passes when iOS app contains main.jsbundle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-app-'));
    const app = path.join(root, 'Demo.app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'main.jsbundle'), 'bundle');

    await expect(doctorBundle({ platform: 'ios', app })).resolves.toEqual(
      expect.objectContaining({ ok: true, bundle: path.join(app, 'main.jsbundle') }),
    );
  });

  it('fails when iOS app misses main.jsbundle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-app-'));
    const app = path.join(root, 'Demo.app');
    fs.mkdirSync(app);

    await expect(doctorBundle({ platform: 'ios', app })).rejects.toThrow('main.jsbundle not found');
  });

  it('checks APK zip listing through injected reader', async () => {
    const readZipEntries = jest.fn(async () => ['AndroidManifest.xml', 'assets/index.android.bundle']);

    await expect(doctorBundle({
      platform: 'android',
      apk: '/tmp/app-debug.apk',
      readZipEntries,
    })).resolves.toEqual(expect.objectContaining({ ok: true, bundle: 'assets/index.android.bundle' }));
  });
});
