#import "RNDoraemonKitBridge.h"

#if __has_include(<DoraemonKit/DoraemonKit.h>)
#import <DoraemonKit/DoraemonKit.h>
#define DORAEMONKIT_AVAILABLE 1
#else
#define DORAEMONKIT_AVAILABLE 0
#endif

@implementation RNDoraemonKitBridge

RCT_EXPORT_MODULE(RNDoraemonKitBridge)

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(installDoraemonKit:(NSString *)productId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if DORAEMONKIT_AVAILABLE
  dispatch_async(dispatch_get_main_queue(), ^{
    [DoraemonKitManager.sharedInstance installWithProductId:productId ?: @""];
  });
#endif
  resolve(@(DORAEMONKIT_AVAILABLE));
}

RCT_EXPORT_METHOD(showDoraemonKit:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if DORAEMONKIT_AVAILABLE
  dispatch_async(dispatch_get_main_queue(), ^{
    [DoraemonKitManager.sharedInstance show];
  });
#endif
  resolve(@(DORAEMONKIT_AVAILABLE));
}

RCT_EXPORT_METHOD(hideDoraemonKit:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if DORAEMONKIT_AVAILABLE
  dispatch_async(dispatch_get_main_queue(), ^{
    [DoraemonKitManager.sharedInstance hide];
  });
#endif
  resolve(@(DORAEMONKIT_AVAILABLE));
}

@end
