#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTReloadCommand.h>

static NSString *const DebugToolkitRCTJsLocationKey = @"RCT_jsLocation";
static NSString *const DebugToolkitBundleRoot = @"index";

static void DebugToolkitResolveAfterReload(NSString *reason, id result, RCTPromiseResolveBlock resolve)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *bundleURL = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:DebugToolkitBundleRoot];
    if (bundleURL) {
      RCTReloadCommandSetBundleURL(bundleURL);
    }
    RCTTriggerReloadCommandListeners(reason);
    resolve(result ?: [NSNull null]);
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

@end
