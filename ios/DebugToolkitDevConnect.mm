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

// Debug-only Metro host switching.
//
// In a Debug build the factory delegate's bundleURL() resolves through
// RCTBundleURLProvider.jsLocation, so setting jsLocation + reloading is exactly how RN's own
// "Configure Bundler" dev-menu item switches the packager host — it hot-reloads immediately.
//
// This does NOT work in Release: RN compiles the dev/packager machinery out (RCT_DEV=0) and a
// Release bridge loads the embedded main.jsbundle at cold launch. On the new architecture,
// loading a remote bundle into a Release runtime is unsupported and crashes, so we deliberately
// gate this feature to Debug builds (see isDebugBuild) and surface that in the UI.

static NSString *const kBundleRoot = @"index";

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

@synthesize bridge = _bridge;
@synthesize bundleManager = _bundleManager;

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

    // jsLocation is the packager host RN's Debug bundleURL() reads. Setting it is the
    // authoritative switch; the reload below re-fetches from the new host.
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    settings.jsLocation = normalized;
    NSURL *bundleURL = [settings jsBundleURLForBundleRoot:kBundleRoot];

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
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];
    NSURL *fallback = [settings jsBundleURLForFallbackExtension:nil];

    [self reloadWithBundleURL:fallback reason:@"Dev menu - reset to default"];

    NSLog(@"[DevConnect] resetMetroHost url=%@", fallback);
    resolve([NSNull null]);
  } @catch (NSException *e) {
    NSLog(@"[DevConnect] resetMetroHost EXCEPTION: %@", e.reason);
    reject(@"native_error", e.reason ?: @"unknown", nil);
  }
}

RCT_EXPORT_METHOD(getMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSString *host = [RCTBundleURLProvider sharedSettings].jsLocation;
  resolve(host.length > 0 ? host : [NSNull null]);
}

RCT_EXPORT_METHOD(getDiagnostics:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  Class realDelegate = object_getClass([UIApplication sharedApplication].delegate);
  NSString *delegateName = realDelegate ? NSStringFromClass(realDelegate) : @"unknown";

#if DEBUG
  BOOL isDebug = YES;
#else
  BOOL isDebug = NO;
#endif

  resolve(@{
    @"persistedMetroHost": [RCTBundleURLProvider sharedSettings].jsLocation ?: [NSNull null],
    @"appDelegateClass": delegateName,
    @"isDebugBuild": @(isDebug),
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
