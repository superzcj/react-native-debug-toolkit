#import "DebugToolkitDevConnect.h"

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#include <ifaddrs.h>
#include <arpa/inet.h>
#include <net/if.h>

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

+ (BOOL)requiresMainQueueSetup { return NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

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
