# iOS DebugToolkitDevConnect Rewrite Design

Date: 2026-05-28

## Final decision (2026-05-29): Debug-only, thin wrapper over RCTBundleURLProvider

Scope was deliberately narrowed to **Debug builds**. We do **not** try to switch Metro host on
Release builds. Why:

- RN's own packager-host switching (Dev Menu → Configure Bundler, `RCTDevSettings`) is gated by
  `RCT_DEV`, which is tied to `DEBUG`. In Release it is compiled out entirely.
- A Release bridge loads the embedded `main.jsbundle` at cold launch. On the **new architecture
  (bridgeless)** — which this project uses — loading a remote HTTP bundle into a Release runtime is
  unsupported and crashes.
- Even `expo-dev-client` only enables bundle switching in Debug-configuration ("development")
  builds; its README states Release builds are unchanged. So the realistic target is a dev build,
  not a production Release build.

Earlier iterations (runtime-reload-only; then method-swizzling of `bundleURL`/`sourceURLForBridge:`
via `objc_getClassList` + per-class IMP maps; then an opt-in C function for Release) were all
attempts to make Release work and were the source of repeated build/runtime breakage.

**Chosen design:** `applyMetroHost` sets `RCTBundleURLProvider.sharedSettings.jsLocation` (the host
RN's Debug `bundleURL()` reads), recomputes the bundle URL, and triggers a reload — exactly what
RN's "Configure Bundler" does, hot-reloading immediately. `getDiagnostics` reports `isDebugBuild`
so the UI disables the controls in Release. No swizzling, no `objc_getClassList`, no `CFDictionary`
IMP maps, no opt-in C function, no `.h` header, no ATS gymnastics.

The sections below are retained for historical context.

---

## Problem

`applyMetroHost` crashes on iOS with RN 0.76 new architecture (default). Root cause:
single-path bundle URL update with no fallback when `bundleManager` is nil.

Android equivalent works because it uses multi-strategy fallback via reflection.

## Scope

Rewrite `ios/DebugToolkitDevConnect.mm` only. JS/TS side unchanged. Android unchanged.

## Design

### Strategy: Defensive Multi-Fallback

Mirror Android's robust approach — try multiple strategies, never crash.

### `applyMetroHost(hostPort)` Flow

1. Parse `hostPort` → split host and port, normalize
2. Persist: `RCTBundleURLProvider.sharedSettings.jsLocation = normalizedHostPort`
3. Generate new bundle URL via `jsBundleURLForBundleRoot:@"index"`
4. Apply bundle URL (try in order):
   - **Strategy 1**: `bundleManager.bundleURL = newURL` (resolve via bridge injection or bridge module registry)
   - **Strategy 2**: `RCTReloadCommandSetBundleURL(newURL)` (legacy API fallback)
   - **Strategy 3**: Skip URL set, rely on `jsLocation` persistence + trigger reload (last resort)
5. `RCTTriggerReloadCommandListeners(@"DevConnect - apply changes")`
6. Return `{ hostPort, bundleURL? }` to JS

### `resetMetroHost()` Flow

1. `RCTBundleURLProvider.sharedSettings resetToDefaults`
2. Generate default URL via `jsBundleURLForFallbackExtension:nil`
3. Apply bundle URL (same multi-strategy as applyMetroHost)
4. Trigger reload
5. Return null to JS

### Resolving bundleManager

```objc
- (RCTBundleManager *)resolveBundleManager
{
  if (_bundleManager) return _bundleManager;
  if (_bridge) {
    return [_bridge moduleForClass:[RCTBundleManager class]];
  }
  return nil;
}
```

Requires synthesizing both properties:
```objc
@synthesize bridge = _bridge;
@synthesize bundleManager = _bundleManager;
```

Old arch: bridge-based lookup works. New arch: property injection works.
Both attempted.

### Crash Protection

Every exported method wrapped in `@try/@catch`. On exception, reject promise
with error details. JS side already handles structured errors.

### Thread Safety

Override `methodQueue` to return `dispatch_get_main_queue()`. All methods
execute on main thread. No dispatch_async needed. No race conditions.

### Unchanged Methods

- `getMetroHost` — read `jsLocation`, pure read
- `getPreference` / `setPreference` — NSUserDefaults
- `isDebugBuild` — compile-time macro
- `getLocalIp` — network interface traversal

These are simple, no crash risk, no bundleManager dependency.

## Files Modified

- `ios/DebugToolkitDevConnect.mm` — complete rewrite

## Files Unchanged

- `src/features/devConnect/nativeDevConnect.ts`
- `src/features/devConnect/devConnectUtils.ts`
- Android native module
- All other project files

## Verification

After rewrite, test on RN 0.76 iOS new architecture:
1. Launch app with Metro on computer A (IP: 192.168.1.100)
2. Enter computer B's IP (192.168.1.200) in DevConnect UI
3. Tap "Use Metro Bundle"
4. Expected: app reloads, loads bundle from computer B's Metro
5. Tap "Reset"
6. Expected: app reloads, loads bundle from original Metro
7. Verify no crash in any scenario (invalid IP, unreachable Metro, etc.)
