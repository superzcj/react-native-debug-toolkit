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

#pragma mark - Configuration

static NSString *const kBundleRoot = @"index";
static NSString *const kMetroHostKey = @"_devconnect_metro_host";

// Default Metro params. dev=true matches expo-dev-client behavior and works when the
// Release app has dev features compiled in (e.g. expo-dev-client). Plain Release builds
// without dev support will likely crash loading a dev bundle — this is a runtime limitation,
// not a bug in this module. UI surfaces this caveat.
static NSString *const kMetroQuery = @"platform=ios&dev=true&minify=false";

#pragma mark - C API (Swift opt-in)

NSURL *DebugToolkitMetroBundleURL(void)
{
  NSString *host = [[NSUserDefaults standardUserDefaults] stringForKey:kMetroHostKey];
  if (host.length == 0) return nil;
  NSString *urlStr = [NSString stringWithFormat:@"http://%@/%@.bundle?%@", host, kBundleRoot, kMetroQuery];
  return [NSURL URLWithString:urlStr];
}

#pragma mark - Swizzle plumbing

// Original IMPs keyed by Class. Each (class, selector) gets its own slot so super-chain calls
// land on the right per-class implementation. NULL value means we tried and the class did not
// implement that method (we still installed via class_addMethod and should return nil if no
// metro host).
static CFMutableDictionaryRef gOrigBundleURL = NULL;     // class -> IMP
static CFMutableDictionaryRef gOrigSourceURL = NULL;     // class -> IMP
static NSMutableArray<NSString *> *gHookedClassNames = nil;

static void ensureSwizzleMaps(void)
{
  if (gOrigBundleURL == NULL) {
    gOrigBundleURL = CFDictionaryCreateMutable(NULL, 0, NULL, NULL);
  }
  if (gOrigSourceURL == NULL) {
    gOrigSourceURL = CFDictionaryCreateMutable(NULL, 0, NULL, NULL);
  }
  if (gHookedClassNames == nil) {
    gHookedClassNames = [NSMutableArray new];
  }
}

static IMP origIMPFor(CFMutableDictionaryRef map, Class cls)
{
  if (!map || !cls) return NULL;
  return (IMP)CFDictionaryGetValue(map, (__bridge const void *)cls);
}

#pragma mark - Replacement IMPs

static NSURL *replacement_bundleURL(id self, SEL _cmd)
{
  NSURL *metro = DebugToolkitMetroBundleURL();
  if (metro) return metro;
  IMP orig = origIMPFor(gOrigBundleURL, [self class]);
  if (orig) return ((NSURL *(*)(id, SEL))orig)(self, _cmd);
  return nil;
}

static NSURL *replacement_sourceURLForBridge(id self, SEL _cmd, RCTBridge *bridge)
{
  NSURL *metro = DebugToolkitMetroBundleURL();
  if (metro) return metro;
  IMP orig = origIMPFor(gOrigSourceURL, [self class]);
  if (orig) return ((NSURL *(*)(id, SEL, RCTBridge *))orig)(self, _cmd, bridge);
  return nil;
}

static void hookSelector(Class cls, SEL selector, IMP replacement, CFMutableDictionaryRef map)
{
  if (!cls || !selector || !replacement || !map) return;
  // Only consider methods directly implemented on this class — we don't want to walk into
  // the superclass and accidentally hook a class twice through inheritance.
  unsigned int count = 0;
  Method *methods = class_copyMethodList(cls, &count);
  Method target = NULL;
  for (unsigned int i = 0; i < count; i++) {
    if (method_getName(methods[i]) == selector) { target = methods[i]; break; }
  }
  free(methods);
  if (!target) return;

  IMP orig = method_getImplementation(target);
  if (orig == replacement) return; // already swizzled in a prior pass

  CFDictionarySetValue(map, (__bridge const void *)cls, orig);
  method_setImplementation(target, replacement);
}

#pragma mark - Class discovery

// Returns YES if cls (or any ancestor) is or inherits from `ancestor`.
static BOOL isKindOfClass(Class cls, Class ancestor)
{
  while (cls) {
    if (cls == ancestor) return YES;
    cls = class_getSuperclass(cls);
  }
  return NO;
}

static void hookFactoryDelegateHierarchy(void)
{
  ensureSwizzleMaps();

  // Modern RN 0.74+ path: ReactNativeDelegate extends RCTDefaultReactNativeFactoryDelegate.
  // Legacy path: AppDelegate extends RCTAppDelegate.
  // We discover and hook every loaded subclass of either, so we don't need to know the
  // user's concrete class name (which is module-prefixed for Swift, e.g. "MyApp.AppDelegate").
  NSArray<NSString *> *parentNames = @[
    @"RCTDefaultReactNativeFactoryDelegate",
    @"RCTReactNativeFactoryDelegate",
    @"RCTAppDelegate",
  ];

  NSMutableArray<Class> *parents = [NSMutableArray new];
  for (NSString *name in parentNames) {
    Class c = NSClassFromString(name);
    if (c) [parents addObject:c];
  }
  if (parents.count == 0) {
    NSLog(@"[DevConnect] no RN factory/delegate base classes loaded yet — hook skipped");
    return;
  }

  int totalClasses = objc_getClassList(NULL, 0);
  if (totalClasses <= 0) return;
  Class *classes = (Class *)malloc(sizeof(Class) * totalClasses);
  totalClasses = objc_getClassList(classes, totalClasses);

  for (int i = 0; i < totalClasses; i++) {
    Class cls = classes[i];
    BOOL match = NO;
    for (Class parent in parents) {
      if (isKindOfClass(cls, parent)) { match = YES; break; }
    }
    if (!match) continue;

    BOOL hadBundleURL = origIMPFor(gOrigBundleURL, cls) != NULL;
    BOOL hadSourceURL = origIMPFor(gOrigSourceURL, cls) != NULL;

    hookSelector(cls, @selector(bundleURL), (IMP)replacement_bundleURL, gOrigBundleURL);
    hookSelector(cls, @selector(sourceURLForBridge:), (IMP)replacement_sourceURLForBridge, gOrigSourceURL);

    BOOL hookedBundleURL = origIMPFor(gOrigBundleURL, cls) != NULL;
    BOOL hookedSourceURL = origIMPFor(gOrigSourceURL, cls) != NULL;
    if ((hookedBundleURL && !hadBundleURL) || (hookedSourceURL && !hadSourceURL)) {
      NSString *name = NSStringFromClass(cls);
      [gHookedClassNames addObject:[NSString stringWithFormat:@"%@(b=%@,s=%@)",
                                    name,
                                    hookedBundleURL ? @"Y" : @"N",
                                    hookedSourceURL ? @"Y" : @"N"]];
      NSLog(@"[DevConnect] hooked %@ bundleURL=%@ sourceURL=%@",
            name, hookedBundleURL ? @"Y" : @"N", hookedSourceURL ? @"Y" : @"N");
    }
  }

  free(classes);
}

#pragma mark - Install timing

__attribute__((constructor))
static void DebugToolkit_install(void)
{
  // dyld load time. User classes from the main binary are loaded by now in static-link setups.
  // Some frameworks may not be loaded yet — the -init fallback below covers late arrivals.
  hookFactoryDelegateHierarchy();
}

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
    // Re-run hierarchy hook in case classes loaded after the constructor (e.g. frameworks
    // loaded by UIApplicationMain). Idempotent — hookSelector skips already-swizzled methods.
    hookFactoryDelegateHierarchy();
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

    // Persist — read on next launch by the swizzled bundleURL/sourceURLForBridge: hooks
    // or by user code calling DebugToolkitMetroBundleURL() from their AppDelegate.
    [[NSUserDefaults standardUserDefaults] setObject:normalized forKey:kMetroHostKey];
    [[NSUserDefaults standardUserDefaults] synchronize];

    // Update Debug mode jsLocation so RN's built-in dev menu / hot reload keeps coherent state.
    [RCTBundleURLProvider sharedSettings].jsLocation = normalized;

    NSURL *bundleURL = DebugToolkitMetroBundleURL();

    // Hot-switch: set BOTH the bundle manager property AND the reload-command global, then
    // trigger reload. Different RN versions / configurations read from different places,
    // and there is no harm in setting both.
    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm && bundleURL) bm.bundleURL = bundleURL;
    if (bundleURL) RCTReloadCommandSetBundleURL(bundleURL);

    NSLog(@"[DevConnect] applyMetroHost host=%@ url=%@ bm=%@",
          normalized, bundleURL, bm ? @"Y" : @"N");
    RCTTriggerReloadCommandListeners(@"Dev menu - apply changes");

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
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:kMetroHostKey];
    [[NSUserDefaults standardUserDefaults] synchronize];

    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];
    NSURL *fallback = [settings jsBundleURLForFallbackExtension:nil];

    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm && fallback) bm.bundleURL = fallback;
    if (fallback) RCTReloadCommandSetBundleURL(fallback);

    NSLog(@"[DevConnect] resetMetroHost url=%@", fallback);
    RCTTriggerReloadCommandListeners(@"Dev menu - reset to default");
    resolve([NSNull null]);
  } @catch (NSException *e) {
    NSLog(@"[DevConnect] resetMetroHost EXCEPTION: %@", e.reason);
    reject(@"native_error", e.reason ?: @"unknown", nil);
  }
}

RCT_EXPORT_METHOD(getMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSString *persisted = [[NSUserDefaults standardUserDefaults] stringForKey:kMetroHostKey];
  resolve(persisted.length > 0 ? persisted : [NSNull null]);
}

RCT_EXPORT_METHOD(getDiagnostics:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  Class realDelegate = object_getClass([UIApplication sharedApplication].delegate);
  NSString *delegateName = realDelegate ? NSStringFromClass(realDelegate) : @"unknown";

  // Has the user's actual factory delegate (where bundleURL lives) been hooked?
  // The factory delegate isn't UIApplication.delegate in modern RN — it's a separate object
  // we can't easily reach without inspecting the user's AppDelegate, so we report on the
  // class names we successfully hooked instead.
  NSArray<NSString *> *hookedNames = [gHookedClassNames ?: @[] copy];

  resolve(@{
    @"persistedMetroHost": [[NSUserDefaults standardUserDefaults] stringForKey:kMetroHostKey] ?: [NSNull null],
    @"appDelegateClass": delegateName,
    @"hookedClasses": hookedNames,
    @"hooksInstalled": @(hookedNames.count > 0),
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
