#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBundleManager.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTDefines.h>
#import <React/RCTReloadCommand.h>
#import <objc/runtime.h>
#include <ifaddrs.h>
#include <arpa/inet.h>
#include <net/if.h>

static NSString *const DebugToolkitBundleRoot = @"index";
static NSString *const kDevConnectMetroHost = @"_devconnect_metro_host";

#pragma mark - AppDelegate Swizzling

static IMP original_sourceURLForBridge = NULL;

static NSURL *devconnect_sourceURLForBridge(id self, SEL _cmd, RCTBridge *bridge)
{
  NSString *metroHost = [[NSUserDefaults standardUserDefaults] stringForKey:kDevConnectMetroHost];
  if (metroHost.length > 0) {
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    NSString *saved = settings.jsLocation;
    settings.jsLocation = metroHost;
    NSURL *url = [settings jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    settings.jsLocation = saved;
    NSLog(@"[DevConnect] swizzle: returning Metro URL %@ (host=%@)", url, metroHost);
    return url;
  }
  if (original_sourceURLForBridge) {
    return ((NSURL *(*)(id, SEL, RCTBridge *))original_sourceURLForBridge)(self, _cmd, bridge);
  }
  return nil;
}

static void swizzleSourceURLForBridge(Class targetClass)
{
  if (!targetClass) return;
  SEL selector = @selector(sourceURLForBridge:);
  Method method = class_getInstanceMethod(targetClass, selector);
  if (!method) return;
  if (original_sourceURLForBridge) return; // Already swizzled
  original_sourceURLForBridge = method_setImplementation(method, (IMP)devconnect_sourceURLForBridge);
  NSLog(@"[DevConnect] swizzled sourceURLForBridge: on %@", NSStringFromClass(targetClass));
}

#pragma mark - Module

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

@synthesize bridge = _bridge;
@synthesize bundleManager = _bundleManager;

+ (void)load
{
  // Stage 1: Try standard AppDelegate class name (covers ObjC and most Swift apps)
  swizzleSourceURLForBridge(NSClassFromString(@"AppDelegate"));
}

- (instancetype)init
{
  if ((self = [super init])) {
    // Stage 2: Fallback — use actual delegate class at runtime
    if (!original_sourceURLForBridge) {
      Class delegateClass = object_getClass([UIApplication sharedApplication].delegate);
      swizzleSourceURLForBridge(delegateClass);
    }
  }
  return self;
}

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

    // Parse host and port
    NSRange separator = [hostPort rangeOfString:@":" options:NSBackwardsSearch];
    NSString *host = separator.location == NSNotFound
        ? hostPort
        : [hostPort substringToIndex:separator.location];
    NSString *port = separator.location == NSNotFound
        ? @""
        : [hostPort substringFromIndex:separator.location + 1];

    if (host.length == 0 && port.length == 0) {
      [self resetMetroHost:resolve rejecter:reject];
      return;
    }

    NSNumberFormatter *formatter = [NSNumberFormatter new];
    formatter.numberStyle = NSNumberFormatterDecimalStyle;
    NSNumber *portNumber = [formatter numberFromString:port];
    if (portNumber == nil) {
      portNumber = [NSNumber numberWithInt:RCT_METRO_PORT];
    }

    NSString *normalizedHostPort = [NSString stringWithFormat:@"%@:%d", host, portNumber.intValue];

    // Persist for AppDelegate swizzle (Release mode + restart)
    [[NSUserDefaults standardUserDefaults] setObject:normalizedHostPort forKey:kDevConnectMetroHost];
    [[NSUserDefaults standardUserDefaults] synchronize];

    // Also set jsLocation (Debug mode + hot reload)
    settings.jsLocation = normalizedHostPort;

    // Try hot reload via bundleManager (works in Debug)
    NSURL *bundleURL = nil;
    if (DebugToolkitBundleRoot.length > 0) {
      bundleURL = [settings jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    }
    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm) {
      bm.bundleURL = bundleURL;
    } else if (bundleURL) {
      RCTReloadCommandSetBundleURL(bundleURL);
    }

    NSLog(@"[DevConnect] applyMetroHost: %@ | bm=%@ | bridge=%@ | url=%@",
          normalizedHostPort, bm ? @"YES" : @"nil", _bridge ? @"YES" : @"nil", bundleURL);

    RCTTriggerReloadCommandListeners(@"Dev menu - apply changes");

    NSMutableDictionary *result = [@{@"hostPort" : normalizedHostPort} mutableCopy];
    if (bm && bm.bundleURL.absoluteString) {
      result[@"bundleURL"] = bm.bundleURL.absoluteString;
    }
    resolve(result);
  } @catch (NSException *exception) {
    NSLog(@"[DevConnect] applyMetroHost EXCEPTION: %@", exception.reason);
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    // Clear stored Metro host
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:kDevConnectMetroHost];
    [[NSUserDefaults standardUserDefaults] synchronize];

    // Reset RN settings
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];
    NSURL *bundleURL = [settings jsBundleURLForFallbackExtension:nil];

    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm) {
      bm.bundleURL = bundleURL;
    }

    NSLog(@"[DevConnect] resetMetroHost | bm=%@ | url=%@", bm ? @"YES" : @"nil", bundleURL);
    RCTTriggerReloadCommandListeners(@"Dev menu - reset to default");
    resolve([NSNull null]);
  } @catch (NSException *exception) {
    NSLog(@"[DevConnect] resetMetroHost EXCEPTION: %@", exception.reason);
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
      struct ifaddrs *iface = interfaces;
      while (iface != NULL) {
        if (iface->ifa_addr != NULL && iface->ifa_addr->sa_family == AF_INET && !(iface->ifa_flags & IFF_LOOPBACK)) {
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
      iface = interfaces;
      while (iface != NULL) {
        if (iface->ifa_addr != NULL && iface->ifa_addr->sa_family == AF_INET && !(iface->ifa_flags & IFF_LOOPBACK)) {
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
