#import <Foundation/Foundation.h>
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

@synthesize bundleManager = _bundleManager;

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(getMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSString *host = [RCTBundleURLProvider sharedSettings].jsLocation;
  resolve(host ?: [NSNull null]);
}

RCT_EXPORT_METHOD(applyMetroHost:(NSString *)hostPort
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (hostPort.length == 0) {
    reject(@"invalid_host", @"Metro host cannot be empty.", nil);
    return;
  }

  RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
  NSRange separator = [hostPort rangeOfString:@":" options:NSBackwardsSearch];
  NSString *host = separator.location == NSNotFound ? hostPort : [hostPort substringToIndex:separator.location];
  NSString *port = separator.location == NSNotFound ? @"" : [hostPort substringFromIndex:separator.location + 1];

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
  settings.jsLocation = normalizedHostPort;

  if (DebugToolkitBundleRoot.length == 0) {
    if (_bundleManager) {
      [_bundleManager resetBundleURL];
    }
  } else {
    NSURL *bundleURL = [settings jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    if (_bundleManager) {
      _bundleManager.bundleURL = bundleURL;
    } else {
      RCTReloadCommandSetBundleURL(bundleURL);
    }
  }

  NSMutableDictionary *result = [@{@"hostPort" : normalizedHostPort} mutableCopy];
  if (_bundleManager && _bundleManager.bundleURL.absoluteString) {
    result[@"bundleURL"] = _bundleManager.bundleURL.absoluteString;
  }

  RCTTriggerReloadCommandListeners(@"DevConnect - apply changes");
  resolve(result);
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [[RCTBundleURLProvider sharedSettings] resetToDefaults];
  NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForFallbackExtension:nil];
  if (_bundleManager) {
    _bundleManager.bundleURL = bundleURL;
  } else {
    RCTReloadCommandSetBundleURL(bundleURL);
  }
  RCTTriggerReloadCommandListeners(@"DevConnect - reset to default");
  resolve([NSNull null]);
}

RCT_EXPORT_METHOD(getPreference:(NSString *)key
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
  resolve(value ?: [NSNull null]);
}

RCT_EXPORT_METHOD(setPreference:(NSString *)key
                  value:(NSString *)value
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] setObject:value forKey:key];
  [[NSUserDefaults standardUserDefaults] synchronize];
  resolve([NSNull null]);
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
  struct ifaddrs *interfaces = NULL;
  if (getifaddrs(&interfaces) == 0) {
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
}

@end
