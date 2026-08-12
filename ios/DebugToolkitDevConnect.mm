#import "DebugToolkitDevConnect.h"

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <React/RCTBridgeModule.h>

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

RCT_EXPORT_METHOD(getAppInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    NSBundle *bundle = [NSBundle mainBundle];
    UIDevice *device = [UIDevice currentDevice];
    resolve(@{
      @"nativeApplicationId": bundle.bundleIdentifier ?: @"",
      @"manufacturer": @"Apple",
      @"model": device.model ?: @"",
      @"osVersion": device.systemVersion ?: @"",
      @"appVersion": [bundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"] ?: @"",
      @"buildNumber": [bundle objectForInfoDictionaryKey:@"CFBundleVersion"] ?: @"",
    });
  } @catch (NSException *e) {
    reject(@"native_error", e.reason ?: @"unknown", nil);
  }
}

@end
