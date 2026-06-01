#import "DebugToolkitDevConnect.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridge.h>
#import <React/RCTBundleManager.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTReloadCommand.h>
#import <objc/runtime.h>
#include <ifaddrs.h>
#include <arpa/inet.h>
#include <net/if.h>

// Debug-only Metro host switching — zero host-app native changes required.
//
// RN/Expo Debug templates call jsBundleURLForBundleRoot:fallbackURLProvider:, which consults
// -packagerServerHostPort (guessPackagerHost on simulator when Metro is running). We only hook
// jsBundleURLForBundleRoot:fallbackURLProvider: so no DevConnect host starts from main.jsbundle.
// Persisted DevConnect hosts still flow through RCTBundleURLProvider, preserving RN's reachability
// and fallback behavior when a saved Metro host is stale.
//
// Optional: host apps may call DebugToolkitMetroBundleURL() from bundleURL() for explicit control.

static NSString *const kBundleRoot = @"index";
// Expo prebuild templates pass this to jsBundleURLForBundleRoot: in Debug (see expo/expo#21643).
static NSString *const kExpoVirtualMetroEntry = @".expo/.virtual-metro-entry";
static NSString *const kMetroHostKey = @"_devconnect_metro_host";

static BOOL gBundleRootHookInstalled = NO;

static NSURL *(*gOrigJsBundleURLForBundleRootWithFallback)(id, SEL, NSString *, NSURL * _Nonnull (^)(void));

static BOOL DevConnectEmbeddedFirstHooksActive(void)
{
  return gBundleRootHookInstalled;
}

static NSURL *DebugToolkitEmbeddedBundleURL(void)
{
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
}

static NSString *DevConnectPersistedMetroHost(void)
{
  return [[NSUserDefaults standardUserDefaults] stringForKey:kMetroHostKey];
}

static void DevConnectSetPersistedMetroHost(NSString *_Nullable hostPort)
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  if (hostPort.length > 0) {
    [defaults setObject:hostPort forKey:kMetroHostKey];
  } else {
    [defaults removeObjectForKey:kMetroHostKey];
  }
  [defaults synchronize];
}

static void DebugToolkitPrepareBundleSourceIfNeeded(void)
{
  // Touch sharedSettings so RCTBundleURLProvider is linked before hook install retries.
  RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
  if (DevConnectPersistedMetroHost().length > 0) {
    return;
  }
  [settings resetToDefaults];
}

static BOOL DevConnectIsExpoProject(void)
{
  static dispatch_once_t onceToken;
  static BOOL isExpo = NO;
  dispatch_once(&onceToken, ^{
    // Heuristic: matches common Expo prebuild / dev-client binaries.
    isExpo = NSClassFromString(@"EXAppDelegateWrapper") != nil
          || [[NSBundle mainBundle] objectForInfoDictionaryKey:@"EXUpdatesURL"] != nil
          || [[NSBundle mainBundle] objectForInfoDictionaryKey:@"EXPO_RUNTIME_VERSION"] != nil;
  });
  return isExpo;
}

/// Bundle root Metro expects when DevConnect steers the packager (index for plain RN, virtual entry for Expo).
static NSString *DevConnectMetroBundleRoot(void)
{
  return DevConnectIsExpoProject() ? kExpoVirtualMetroEntry : kBundleRoot;
}

static NSURL *DevConnectMetroURLForPersistedHost(void)
{
  NSString *host = DevConnectPersistedMetroHost();
  if (host.length == 0) {
    return nil;
  }
  RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
  settings.jsLocation = host;
  return [settings jsBundleURLForBundleRoot:DevConnectMetroBundleRoot()];
}

/// Primary hook: return embedded main.jsbundle before RN/Expo tries Metro / virtual-metro-entry.
static NSURL *replacement_jsBundleURLForBundleRoot_fallback(
    id self, SEL _cmd, NSString *bundleRoot, NSURL * _Nonnull (^fallbackURLProvider)(void))
{
  if (DevConnectPersistedMetroHost().length == 0) {
    NSURL *embedded = DebugToolkitEmbeddedBundleURL();
    if (embedded) {
      NSLog(@"[DevConnect] cold start → embedded bundle (root=%@)", bundleRoot);
      return embedded;
    }
    NSLog(@"[DevConnect] no embedded main.jsbundle — falling back to Metro (root=%@)", bundleRoot);
  }

  if (gOrigJsBundleURLForBundleRootWithFallback) {
    return gOrigJsBundleURLForBundleRootWithFallback(self, _cmd, bundleRoot, fallbackURLProvider);
  }
  return fallbackURLProvider ? fallbackURLProvider() : nil;
}

static void DebugToolkitInstallBundleRootHook(Class cls)
{
  if (gBundleRootHookInstalled) {
    return;
  }
  SEL selector = @selector(jsBundleURLForBundleRoot:fallbackURLProvider:);
  Method method = class_getInstanceMethod(cls, selector);
  if (!method) {
    NSLog(@"[DevConnect] jsBundleURLForBundleRoot:fallbackURLProvider: not found");
    return;
  }
  IMP replacement = (IMP)replacement_jsBundleURLForBundleRoot_fallback;
  gOrigJsBundleURLForBundleRootWithFallback =
      (NSURL * (*)(id, SEL, NSString *, NSURL * _Nonnull (^)(void)))method_getImplementation(method);
  if ((IMP)gOrigJsBundleURLForBundleRootWithFallback == replacement) {
    gBundleRootHookInstalled = YES;
    return;
  }
  method_setImplementation(method, replacement);
  gBundleRootHookInstalled = YES;
}

static void DebugToolkitInstallAllHooks(void)
{
  if (gBundleRootHookInstalled) {
    return;
  }

  Class cls = NSClassFromString(@"RCTBundleURLProvider");
  if (!cls) {
    NSLog(@"[DevConnect] RCTBundleURLProvider not loaded — hooks will retry");
    return;
  }

  DebugToolkitInstallBundleRootHook(cls);

  static BOOL didLogOutcome = NO;
  if (!didLogOutcome) {
    didLogOutcome = YES;
    if (DevConnectEmbeddedFirstHooksActive()) {
      NSLog(@"[DevConnect] embedded-first hook active");
    } else {
      NSLog(@"[DevConnect] embedded-first hooks FAILED — rebuild / check React linkage");
    }
  }
}

NSURL *DebugToolkitMetroBundleURL(void)
{
  return DevConnectMetroURLForPersistedHost();
}

// RCT_EXPORT_MODULE defines +load for module registration — use a separate class for hooks.
@interface DebugToolkitDevConnectBootstrap : NSObject
@end

@implementation DebugToolkitDevConnectBootstrap

+ (void)load
{
  DebugToolkitPrepareBundleSourceIfNeeded();
  DebugToolkitInstallAllHooks();
}

@end

#pragma mark - Module

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

@synthesize bridge = _bridge;
@synthesize bundleManager = _bundleManager;

- (instancetype)init
{
  if ((self = [super init])) {
    DebugToolkitInstallAllHooks();
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup { return NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

#pragma mark - Bundle Manager Resolution

- (RCTBundleManager *)resolveBundleManager
{
  if (_bundleManager) return _bundleManager;
  if (_bridge) return [_bridge moduleForClass:[RCTBundleManager class]];
  return nil;
}

#pragma mark - Host Parsing

- (NSString *)normalizeHostPort:(NSString *)hostPort
{
  NSRange sep = [hostPort rangeOfString:@":" options:NSBackwardsSearch];
  NSString *host = sep.location == NSNotFound ? hostPort : [hostPort substringToIndex:sep.location];
  NSString *portStr = sep.location == NSNotFound ? @"" : [hostPort substringFromIndex:sep.location + 1];

  NSNumberFormatter *formatter = [NSNumberFormatter new];
  formatter.numberStyle = NSNumberFormatterDecimalStyle;
  NSNumber *parsed = [formatter numberFromString:portStr];
  int port;
  if (parsed && parsed.intValue > 0 && parsed.intValue <= 65535) {
    port = parsed.intValue;
  } else {
#ifdef RCT_METRO_PORT
    port = RCT_METRO_PORT;
#else
    port = 8081;
#endif
  }
  return [NSString stringWithFormat:@"%@:%d", host, port];
}

#pragma mark - Reload helper

- (void)reloadWithBundleURL:(NSURL *)bundleURL reason:(NSString *)reason
{
  if (bundleURL) {
    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm) bm.bundleURL = bundleURL;
    RCTReloadCommandSetBundleURL(bundleURL);
  }
  RCTTriggerReloadCommandListeners(reason);
}

#pragma mark - Exported Methods

RCT_EXPORT_METHOD(applyMetroHost:(NSString *)hostPort
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    if (hostPort.length == 0) {
      reject(@"invalid_host", @"Metro host cannot be empty.", nil);
      return;
    }
    NSString *normalized = [self normalizeHostPort:hostPort];

    DevConnectSetPersistedMetroHost(normalized);

    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    settings.jsLocation = normalized;
    NSURL *bundleURL = [settings jsBundleURLForBundleRoot:DevConnectMetroBundleRoot()];

    [self reloadWithBundleURL:bundleURL reason:@"Dev menu - apply changes"];

    NSLog(@"[DevConnect] applyMetroHost host=%@ url=%@", normalized, bundleURL);
    resolve(@{
      @"hostPort": normalized,
      @"bundleURL": bundleURL.absoluteString ?: [NSNull null],
    });
  } @catch (NSException *e) {
    NSLog(@"[DevConnect] applyMetroHost EXCEPTION: %@", e.reason);
    reject(@"native_error", e.reason ?: @"unknown", nil);
  }
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    DevConnectSetPersistedMetroHost(nil);

    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];

    NSURL *embedded = DebugToolkitEmbeddedBundleURL();
    if (!embedded) {
      embedded = [settings jsBundleURLForFallbackExtension:nil];
    }

    [self reloadWithBundleURL:embedded reason:@"Dev menu - reset to default"];

    NSLog(@"[DevConnect] resetMetroHost url=%@", embedded);
    resolve([NSNull null]);
  } @catch (NSException *e) {
    NSLog(@"[DevConnect] resetMetroHost EXCEPTION: %@", e.reason);
    reject(@"native_error", e.reason ?: @"unknown", nil);
  }
}

RCT_EXPORT_METHOD(getMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSString *host = DevConnectPersistedMetroHost();
  resolve(host.length > 0 ? host : [NSNull null]);
}

RCT_EXPORT_METHOD(getDiagnostics:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  Class realDelegate = object_getClass([UIApplication sharedApplication].delegate);
  NSString *delegateName = realDelegate ? NSStringFromClass(realDelegate) : @"unknown";
  NSString *persisted = DevConnectPersistedMetroHost();

#if DEBUG
  BOOL isDebug = YES;
#else
  BOOL isDebug = NO;
#endif

  resolve(@{
    @"persistedMetroHost": persisted.length > 0 ? persisted : [NSNull null],
    @"appDelegateClass": delegateName,
    @"isDebugBuild": @(isDebug),
    @"hasEmbeddedBundle": @(DebugToolkitEmbeddedBundleURL() != nil),
    @"embeddedFirstHookInstalled": @(DevConnectEmbeddedFirstHooksActive()),
    @"packagerHookInstalled": @NO,
    @"bundleRootHookInstalled": @(gBundleRootHookInstalled),
  });
}

RCT_EXPORT_METHOD(getPreference:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
    resolve(value ?: [NSNull null]);
  } @catch (NSException *e) {
    reject(@"native_error", e.reason ?: @"unknown", nil);
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
  } @catch (NSException *e) {
    reject(@"native_error", e.reason ?: @"unknown", nil);
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
    if (getifaddrs(&interfaces) != 0) {
      resolve([NSNull null]);
      return;
    }

    NSString *preferred = nil;
    NSString *fallback = nil;
    for (struct ifaddrs *iface = interfaces; iface != NULL; iface = iface->ifa_next) {
      if (!iface->ifa_addr || iface->ifa_addr->sa_family != AF_INET) continue;
      if (iface->ifa_flags & IFF_LOOPBACK) continue;
      char addrStr[INET_ADDRSTRLEN];
      struct sockaddr_in *sin = (struct sockaddr_in *)iface->ifa_addr;
      inet_ntop(AF_INET, &sin->sin_addr, addrStr, sizeof(addrStr));
      NSString *ip = [NSString stringWithUTF8String:addrStr];
      if (strcmp(iface->ifa_name, "en0") == 0) { preferred = ip; break; }
      if (!fallback) fallback = ip;
    }
    freeifaddrs(interfaces);
    resolve(preferred ?: fallback ?: [NSNull null]);
  } @catch (NSException *e) {
    reject(@"native_error", e.reason ?: @"unknown", nil);
  }
}

@end
