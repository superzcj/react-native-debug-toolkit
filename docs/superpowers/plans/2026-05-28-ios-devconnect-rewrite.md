# iOS DebugToolkitDevConnect Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `ios/DebugToolkitDevConnect.mm` with defensive multi-strategy bundle URL management that doesn't crash on RN 0.76 new architecture.

**Architecture:** Mirror Android's robust approach — resolve `bundleManager` via both property injection and bridge lookup, apply bundle URL with three fallback strategies, wrap everything in `@try/@catch`, execute on main queue via `methodQueue` override.

**Tech Stack:** Objective-C++, React Native 0.76+ native module APIs

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `ios/DebugToolkitDevConnect.mm` | Rewrite | Native module with multi-strategy bundle management |
| `src/__tests__/features/nativeDevConnectSource.test.ts` | Modify | Update source contract assertions for new design |

---

### Task 1: Update source contract test

**Files:**
- Modify: `src/__tests__/features/nativeDevConnectSource.test.ts:19-29`

- [ ] **Step 1: Update the iOS source contract test to expect new defensive patterns**

Replace lines 19–29 of `src/__tests__/features/nativeDevConnectSource.test.ts` with:

```typescript
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
    expect(source).toContain('resetBundleURL');
    expect(source).toContain('RCTReloadCommandSetBundleURL');

    // Crash protection
    expect(source).toContain('@try');
    expect(source).toContain('@catch');

    // Main queue thread safety
    expect(source).toContain('dispatch_get_main_queue()');

    // Reload reasons matching RN DevMenu
    expect(source).toContain('Dev menu - apply changes');
    expect(source).toContain('Dev menu - reset to default');
  });
```

- [ ] **Step 2: Run test to verify it fails (old code doesn't have `resolveBundleManager`, `@try`, etc.)**

Run: `npx jest src/__tests__/features/nativeDevConnectSource.test.ts --verbose 2>&1 | tail -20`
Expected: FAIL — missing `resolveBundleManager`, `@try`, `@catch`, `dispatch_get_main_queue()`

- [ ] **Step 3: Commit test update**

```bash
git add src/__tests__/features/nativeDevConnectSource.test.ts
git commit -m "test: update iOS DevConnect source contract for defensive multi-strategy design"
```

---

### Task 2: Rewrite iOS implementation

**Files:**
- Rewrite: `ios/DebugToolkitDevConnect.mm` (full file)

- [ ] **Step 1: Write the complete rewritten file**

Write the following to `ios/DebugToolkitDevConnect.mm`:

```objc
#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBundleManager.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTDefines.h>
#import <React/RCTReloadCommand.h>
#include <ifaddrs.h>
#include <arpa/inet.h>
#include <net/if.h>

static NSString *const DebugToolkitBundleRoot = @"index";

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

@synthesize bridge = _bridge;
@synthesize bundleManager = _bundleManager;

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

#pragma mark - Bundle Manager Resolution

- (RCTBundleManager *)resolveBundleManager
{
  if (_bundleManager) {
    return _bundleManager;
  }
  if (_bridge) {
    return [_bridge moduleForClass:[RCTBundleManager class]];
  }
  return nil;
}

#pragma mark - Apply Bundle URL (multi-strategy)

- (BOOL)applyBundleURL:(NSURL *)bundleURL
{
  // Strategy 1: Use bundleManager (new arch property injection or bridge lookup)
  RCTBundleManager *bm = [self resolveBundleManager];
  if (bm) {
    if (bundleURL) {
      bm.bundleURL = bundleURL;
    } else {
      [bm resetBundleURL];
    }
    return YES;
  }

  // Strategy 2: Legacy reload command API
  if (bundleURL) {
    RCTReloadCommandSetBundleURL(bundleURL);
    return YES;
  }

  // Strategy 3: No URL to set, rely on jsLocation persistence + reload trigger
  return NO;
}

#pragma mark - Exported Methods

RCT_EXPORT_METHOD(getMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    NSString *host = [RCTBundleURLProvider sharedSettings].jsLocation;
    resolve(host ?: [NSNull null]);
  } @catch (NSException *exception) {
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(applyMetroHost:(NSString *)hostPort
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    if (hostPort.length == 0) {
      reject(@"invalid_host", @"Metro host cannot be empty.", nil);
      return;
    }

    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];

    // Parse host and port (mirrors RN DevMenu Configure Bundler)
    NSRange separator = [hostPort rangeOfString:@":" options:NSBackwardsSearch];
    NSString *host = separator.location == NSNotFound
        ? hostPort
        : [hostPort substringToIndex:separator.location];
    NSString *port = separator.location == NSNotFound
        ? @""
        : [hostPort substringFromIndex:separator.location + 1];

    // Empty host+port → reset
    if (host.length == 0 && port.length == 0) {
      [self resetMetroHost:resolve rejecter:reject];
      return;
    }

    // Normalize port
    NSNumberFormatter *formatter = [NSNumberFormatter new];
    formatter.numberStyle = NSNumberFormatterDecimalStyle;
    NSNumber *portNumber = [formatter numberFromString:port];
    if (portNumber == nil) {
      portNumber = [NSNumber numberWithInt:RCT_METRO_PORT];
    }

    NSString *normalizedHostPort = [NSString stringWithFormat:@"%@:%d", host, portNumber.intValue];

    // Persist Metro host setting
    settings.jsLocation = normalizedHostPort;

    // Apply bundle URL
    NSURL *bundleURL = nil;
    if (DebugToolkitBundleRoot.length > 0) {
      bundleURL = [settings jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    }

    [self applyBundleURL:bundleURL];

    // Build result
    NSMutableDictionary *result = [@{@"hostPort" : normalizedHostPort} mutableCopy];
    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm && bm.bundleURL.absoluteString) {
      result[@"bundleURL"] = bm.bundleURL.absoluteString;
    }

    RCTTriggerReloadCommandListeners(@"Dev menu - apply changes");
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];
    NSURL *bundleURL = [settings jsBundleURLForFallbackExtension:nil];

    [self applyBundleURL:bundleURL];
    RCTTriggerReloadCommandListeners(@"Dev menu - reset to default");
    resolve([NSNull null]);
  } @catch (NSException *exception) {
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(getPreference:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
    resolve(value ?: [NSNull null]);
  } @catch (NSException *exception) {
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(setPreference:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    [[NSUserDefaults standardUserDefaults] setObject:value forKey:key];
    [[NSUserDefaults standardUserDefaults] synchronize];
    resolve([NSNull null]);
  } @catch (NSException *exception) {
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(isDebugBuild:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if DEBUG
  resolve(@YES);
#else
  resolve(@NO);
#endif
}

RCT_EXPORT_METHOD(getLocalIp:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    struct ifaddrs *interfaces = NULL;
    if (getifaddrs(&interfaces) == 0) {
      // First pass: prefer Wi-Fi interface (en0)
      struct ifaddrs *iface = interfaces;
      while (iface != NULL) {
        if (iface->ifa_addr->sa_family == AF_INET && !(iface->ifa_flags & IFF_LOOPBACK)) {
          if (strcmp(iface->ifa_name, "en0") == 0) {
            char addrStr[INET_ADDRSTRLEN];
            struct sockaddr_in *sin = (struct sockaddr_in *)iface->ifa_addr;
            inet_ntop(AF_INET, &sin->sin_addr, addrStr, sizeof(addrStr));
            NSString *ip = [NSString stringWithUTF8String:addrStr];
            freeifaddrs(interfaces);
            resolve(ip);
            return;
          }
        }
        iface = iface->ifa_next;
      }
      // Second pass: any non-loopback IPv4
      iface = interfaces;
      while (iface != NULL) {
        if (iface->ifa_addr->sa_family == AF_INET && !(iface->ifa_flags & IFF_LOOPBACK)) {
          char addrStr[INET_ADDRSTRLEN];
          struct sockaddr_in *sin = (struct sockaddr_in *)iface->ifa_addr;
          inet_ntop(AF_INET, &sin->sin_addr, addrStr, sizeof(addrStr));
          NSString *ip = [NSString stringWithUTF8String:addrStr];
          freeifaddrs(interfaces);
          resolve(ip);
          return;
        }
        iface = iface->ifa_next;
      }
    }
    freeifaddrs(interfaces);
    resolve([NSNull null]);
  } @catch (NSException *exception) {
    reject(@"native_error", exception.reason, nil);
  }
}

@end
```

- [ ] **Step 2: Run source contract test to verify it passes**

Run: `npx jest src/__tests__/features/nativeDevConnectSource.test.ts --verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 3: Run all DevConnect tests to verify nothing broken**

Run: `npx jest src/__tests__/features/ --verbose 2>&1 | tail -30`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add ios/DebugToolkitDevConnect.mm
git commit -m "rewrite: iOS DevConnect with defensive multi-strategy bundle management

- Resolve bundleManager via property injection + bridge fallback
- Three-tier bundle URL apply strategy (bundleManager → RCTReloadCommand → jsLocation)
- @try/@catch crash protection on all exported methods
- methodQueue returns main queue for thread safety
- Mirrors Android's robust multi-fallback approach"
```

---

### Task 3: Verify JS integration tests still pass

**Files:** None (verification only)

- [ ] **Step 1: Run full JS test suite**

Run: `npx jest --verbose 2>&1 | tail -30`
Expected: All PASS — JS tests mock the native module so they're independent of ObjC changes.

- [ ] **Step 2: Final commit if any adjustments needed**

Only if tests revealed issues. Otherwise skip.
