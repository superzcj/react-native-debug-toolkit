#if DEBUG
#import <React/RCTBridgeModule.h>
#import <objc/message.h>

@interface DebugToolkitViewInspector : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitViewInspector

RCT_EXPORT_MODULE(DebugToolkitViewInspector)

+ (BOOL)requiresMainQueueSetup { return NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

RCT_EXPORT_METHOD(show:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  Class managerClass = NSClassFromString(@"FLEXManager");
  if (!managerClass) { resolve(@"unavailable"); return; }
  id manager = ((id (*)(id, SEL))objc_msgSend)(managerClass, NSSelectorFromString(@"sharedManager"));
  ((void (*)(id, SEL))objc_msgSend)(manager, NSSelectorFromString(@"showExplorer"));
  resolve(@"opened");
}

@end
#endif
