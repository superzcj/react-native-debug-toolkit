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

    // Port normalization (mirrors RN DevMenu Configure Bundler)
    expect(source).toContain('NSNumberFormatter');
    expect(source).toContain('RCT_METRO_PORT');

    // Bundle URL generation
    expect(source).toContain('jsBundleURLForBundleRoot');
    expect(source).toContain('jsBundleURLForFallbackExtension:nil');

    // Multi-strategy bundle application
    expect(source).toContain('resolveBundleManager');
    expect(source).toContain('RCTReloadCommandSetBundleURL');

    // AppDelegate swizzle for Release mode
    expect(source).toContain('sourceURLForBridge');
    expect(source).toContain('swizzleSourceURLForBridge');

    // Persistence for Metro host
    expect(source).toContain('_devconnect_metro_host');

    // Crash protection
    expect(source).toContain('@try');
    expect(source).toContain('@catch');

    // Main queue thread safety
    expect(source).toContain('dispatch_get_main_queue()');

    // Reload reasons matching RN DevMenu
    expect(source).toContain('Dev menu - apply changes');
    expect(source).toContain('Dev menu - reset to default');
  });
});
