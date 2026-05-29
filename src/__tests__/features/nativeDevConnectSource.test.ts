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

  it('exposes the Metro bundle URL contract on iOS', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.mm'), 'utf8');

    expect(source).toContain('NSNumberFormatter');
    expect(source).toContain('RCT_METRO_PORT');

    expect(source).toContain('jsBundleURLForFallbackExtension:nil');

    expect(source).toContain('resolveBundleManager');
    expect(source).toContain('RCTReloadCommandSetBundleURL');
    expect(source).toContain('RCTTriggerReloadCommandListeners');

    // Hook the factory-delegate hierarchy (RN 0.74+) plus legacy bridge delegates.
    expect(source).toContain('RCTDefaultReactNativeFactoryDelegate');
    expect(source).toContain('bundleURL');
    expect(source).toContain('sourceURLForBridge');

    // C API exposed to Swift opt-in (AppDelegate bundleURL override).
    expect(source).toContain('DebugToolkitMetroBundleURL');

    expect(source).toContain('_devconnect_metro_host');

    expect(source).toContain('@try');
    expect(source).toContain('@catch');

    expect(source).toContain('dispatch_get_main_queue()');

    expect(source).toContain('Dev menu - apply changes');
    expect(source).toContain('Dev menu - reset to default');
  });

  it('exposes the public C API header for Swift consumption', () => {
    const header = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.h'), 'utf8');
    expect(header).toContain('DebugToolkitMetroBundleURL');
    expect(header).toContain('FOUNDATION_EXPORT');
  });
});
