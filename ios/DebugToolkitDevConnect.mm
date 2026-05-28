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

- (void)saveDiagnostic:(NSDictionary *)info
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:info options:0 error:nil];
  if (data) {
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [[NSUserDefaults standardUserDefaults] setObject:json forKey:@"_devconnect_last_diagnostic"];
    [[NSUserDefaults standardUserDefaults] synchronize];
  }
}

#pragma mark - Apply Bundle URL (multi-strategy)

- (BOOL)applyBundleURL:(NSURL *)bundleURL
{
  RCTBundleManager *bm = [self resolveBundleManager];
  if (bm) {
    if (bundleURL) {
      bm.bundleURL = bundleURL;
      NSLog(@"[DevConnect] applyBundleURL strategy 1: set bm.bundleURL = %@", bundleURL);
    } else {
      [bm resetBundleURL];
      NSLog(@"[DevConnect] applyBundleURL strategy 1: resetBundleURL");
    }
    return YES;
  }

  if (bundleURL) {
    RCTReloadCommandSetBundleURL(bundleURL);
    NSLog(@"[DevConnect] applyBundleURL strategy 2: RCTReloadCommandSetBundleURL = %@", bundleURL);
    return YES;
  }

  NSLog(@"[DevConnect] applyBundleURL strategy 3: no URL, relying on jsLocation persistence");
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
    NSLog(@"[DevConnect] applyMetroHost called with: %@", hostPort);

    if (hostPort.length == 0) {
      reject(@"invalid_host", @"Metro host cannot be empty.", nil);
      return;
    }

    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];

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
    NSLog(@"[DevConnect] normalizedHostPort: %@", normalizedHostPort);

    settings.jsLocation = normalizedHostPort;
    NSLog(@"[DevConnect] jsLocation set, verify: %@", settings.jsLocation);

    NSURL *bundleURL = nil;
    if (DebugToolkitBundleRoot.length > 0) {
      bundleURL = [settings jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    }
    NSLog(@"[DevConnect] generated bundleURL: %@", bundleURL);

    RCTBundleManager *bm = [self resolveBundleManager];
    BOOL applied = [self applyBundleURL:bundleURL];
    NSLog(@"[DevConnect] resolveBundleManager: %@", bm ? @"found" : @"nil");
    NSLog(@"[DevConnect] applyBundleURL result: %@", applied ? @"YES" : @"NO");
    NSLog(@"[DevConnect] _bundleManager injected: %@", _bundleManager ? @"YES" : @"nil");
    NSLog(@"[DevConnect] _bridge available: %@", _bridge ? @"YES" : @"nil");

    if (bm) {
      NSLog(@"[DevConnect] bm.bundleURL after apply: %@", bm.bundleURL);
    }

    // Save diagnostic before reload (survives restart)
    NSMutableDictionary *diagnostic = [@{
      @"hostPort" : normalizedHostPort ?: @"",
      @"bundleManagerInjected" : _bundleManager ? @"YES" : @"nil",
      @"bridgeAvailable" : _bridge ? @"YES" : @"nil",
      @"resolvedBM" : bm ? @"YES" : @"nil",
      @"bundleURL" : bundleURL.absoluteString ?: @"nil",
      @"applied" : applied ? @"YES" : @"NO",
    } mutableCopy];
    if (bm) {
      diagnostic[@"bmBundleURL"] = bm.bundleURL.absoluteString ?: @"nil";
    }
    [self saveDiagnostic:diagnostic];

    NSMutableDictionary *result = [@{@"hostPort" : normalizedHostPort} mutableCopy];
    if (bm && bm.bundleURL.absoluteString) {
      result[@"bundleURL"] = bm.bundleURL.absoluteString;
    }

    // TEMP DIAGNOSTIC: skip reload, return diagnostic for UI inspection
    NSLog(@"[DevConnect] DIAGNOSTIC mode: skipping reload, returning diagnostic");
    NSDictionary *diagCopy = [diagnostic copy];
    NSMutableString *debugMsg = [NSMutableString string];
    [diagCopy enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *val, BOOL *stop) {
      [debugMsg appendFormat:@"%@=%@  ", key, val];
    }];
    result[@"_debugDiagnostic"] = debugMsg;
    resolve(result);

    // TODO: Restore reload after diagnosis
    // RCTTriggerReloadCommandListeners(@"Dev menu - apply changes");
  } @catch (NSException *exception) {
    NSLog(@"[DevConnect] EXCEPTION: %@ - %@", exception.name, exception.reason);
    // Save exception diagnostic
    [self saveDiagnostic:@{
      @"error" : exception.reason ?: @"unknown",
      @"exception" : exception.name ?: @"unknown",
    }];
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    NSLog(@"[DevConnect] resetMetroHost called");
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];
    NSURL *bundleURL = [settings jsBundleURLForFallbackExtension:nil];
    NSLog(@"[DevConnect] reset bundleURL: %@", bundleURL);

    [self applyBundleURL:bundleURL];
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
