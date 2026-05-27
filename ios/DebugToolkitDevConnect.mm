#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTReloadCommand.h>
#include <ifaddrs.h>
#include <arpa/inet.h>
#include <net/if.h>

static NSString *const DebugToolkitRCTJsLocationKey = @"RCT_jsLocation";
static NSString *const DebugToolkitBundleRoot = @"index";

static void DebugToolkitResolveAfterReload(NSString *reason, id result, RCTPromiseResolveBlock resolve)
{
  resolve(result ?: [NSNull null]);
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    if (bundleURL) {
      RCTReloadCommandSetBundleURL(bundleURL);
    }
    RCTTriggerReloadCommandListeners(reason);
  });
}

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
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

  [RCTBundleURLProvider sharedSettings].jsLocation = hostPort;
  DebugToolkitResolveAfterReload(@"DebugToolkit DevConnect Metro host changed", @{ @"hostPort" : hostPort }, resolve);
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  [defaults removeObjectForKey:DebugToolkitRCTJsLocationKey];
  [defaults synchronize];
  [[NSNotificationCenter defaultCenter] postNotificationName:RCTBundleURLProviderUpdatedNotification object:nil];
  DebugToolkitResolveAfterReload(@"DebugToolkit DevConnect Metro host reset", [NSNull null], resolve);
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
}

@end
