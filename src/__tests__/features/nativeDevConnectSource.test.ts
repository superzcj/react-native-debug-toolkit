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

    // DevConnect host is persisted separately; jsLocation is only set when a host is applied.
    expect(source).toContain('_devconnect_metro_host');
    expect(source).toContain('jsLocation');
    expect(source).toContain('jsBundleURLForBundleRoot');
    expect(source).toContain('DebugToolkitEmbeddedBundleURL');
    expect(source).toContain('DevConnectSetPersistedMetroHost');
    expect(source).toContain('settings.jsLocation = normalized');

    // Do not bypass RN's packager reachability check. A persisted stale host must be allowed to
    // fall back through RCTBundleURLProvider instead of being returned blindly.
    expect(source).not.toContain('return host;\n}');
    expect(source).not.toContain('replacement_packagerServerHostPort');

    expect(source).toContain('resolveBundleManager');
    expect(source).toContain('RCTReloadCommandSetBundleURL');
    expect(source).toContain('RCTTriggerReloadCommandListeners');

    // Zero-config: primary hook on jsBundleURLForBundleRoot returns embedded before Metro.
    expect(source).toContain('replacement_jsBundleURLForBundleRoot_fallback');
    expect(source).toContain('DebugToolkitInstallBundleRootHook');
    expect(source).toContain('bundleRootHookInstalled');
    expect(source).toContain('DebugToolkitDevConnectBootstrap');
    expect(source).not.toMatch(/DebugToolkitInstallAllHooks[\s\S]*dispatch_once/);

    expect(source).toContain('DebugToolkitMetroBundleURL');
    expect(source).toContain('DevConnectMetroBundleRoot');
    expect(source).toContain('.expo/.virtual-metro-entry');

    // Single-class hook only — no full runtime class scan.
    expect(source).not.toContain('objc_getClassList');

    expect(source).toContain('isDebugBuild');

    expect(source).toContain('@try');
    expect(source).toContain('@catch');

    expect(source).toContain('dispatch_get_main_queue()');

    expect(source).toContain('Dev menu - apply changes');
    expect(source).toContain('Dev menu - reset to default');
  });

  it('exposes the public C API header (optional override)', () => {
    const header = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.h'), 'utf8');
    expect(header).toContain('DebugToolkitMetroBundleURL');
    expect(header).toContain('Zero-config');
    expect(header).toContain('FOUNDATION_EXPORT');
  });
});
