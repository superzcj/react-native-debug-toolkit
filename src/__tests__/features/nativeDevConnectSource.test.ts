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

  it('switches the Metro packager host via RCTBundleURLProvider on iOS (Debug-only)', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.mm'), 'utf8');

    expect(source).toContain('NSNumberFormatter');
    expect(source).toContain('RCT_METRO_PORT');

    // jsLocation is the packager host RN's Debug bundleURL() reads — the native switch.
    expect(source).toContain('jsLocation');
    expect(source).toContain('jsBundleURLForBundleRoot');
    expect(source).toContain('jsBundleURLForFallbackExtension:nil');

    expect(source).toContain('resolveBundleManager');
    expect(source).toContain('RCTReloadCommandSetBundleURL');
    expect(source).toContain('RCTTriggerReloadCommandListeners');

    // Debug-only gating is reported to JS so the UI can disable controls in Release.
    expect(source).toContain('isDebugBuild');

    // No runtime method swizzling and no opt-in C API (removed in the Debug-only rewrite).
    expect(source).not.toContain('method_setImplementation');
    expect(source).not.toContain('objc_getClassList');
    expect(source).not.toContain('DebugToolkitMetroBundleURL');

    expect(source).toContain('@try');
    expect(source).toContain('@catch');

    expect(source).toContain('dispatch_get_main_queue()');

    expect(source).toContain('Dev menu - apply changes');
    expect(source).toContain('Dev menu - reset to default');
  });
});
