#import "RNFLEXBridge.h"

#if __has_include(<FLEX/FLEXManager.h>)
#import <FLEX/FLEXManager.h>
#define FLEX_AVAILABLE 1
#else
#define FLEX_AVAILABLE 0
#endif

@implementation RNFLEXBridge

RCT_EXPORT_MODULE(RNFLEXBridge)

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(showExplorer:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if FLEX_AVAILABLE
  dispatch_async(dispatch_get_main_queue(), ^{
    [FLEXManager.shared showExplorer];
  });
#endif
  resolve(@(FLEX_AVAILABLE));
}

RCT_EXPORT_METHOD(hideExplorer:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if FLEX_AVAILABLE
  dispatch_async(dispatch_get_main_queue(), ^{
    [FLEXManager.shared hideExplorer];
  });
#endif
  resolve(@(FLEX_AVAILABLE));
}

RCT_EXPORT_METHOD(toggleExplorer:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
#if FLEX_AVAILABLE
  dispatch_async(dispatch_get_main_queue(), ^{
    [FLEXManager.shared toggleExplorer];
  });
#endif
  resolve(@(FLEX_AVAILABLE));
}

@end
