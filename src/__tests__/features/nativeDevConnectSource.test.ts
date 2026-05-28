import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('native DevConnect source contracts', () => {
  it('uses React Native bundle source APIs on Android', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitDevConnectModule.java'),
      'utf8',
    );

    expect(source).toContain('setBundleSource');
    expect(source).toContain('kotlin.jvm.functions.Function1');
    expect(source).toContain('setDebugServerHost');
    expect(source).toContain('handleReloadJS');
  });

  it('mirrors React Native Configure Bundler apply/reset flow on iOS', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.mm'), 'utf8');

    expect(source).toContain('NSNumberFormatter');
    expect(source).toContain('RCT_METRO_PORT');
    expect(source).toContain('jsBundleURLForBundleRoot');
    expect(source).toContain('resetBundleURL');
    expect(source).toContain('jsBundleURLForFallbackExtension:nil');
    expect(source).toContain('Dev menu - apply changes');
    expect(source).toContain('Dev menu - reset to default');
    expect(source).not.toContain('bundle_url_unavailable');
  });
});
