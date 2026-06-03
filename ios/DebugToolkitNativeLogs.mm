#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTLog.h>

@interface DebugToolkitNativeLogs : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitNativeLogs

RCT_EXPORT_MODULE(DebugToolkitNativeLogs)

static const NSUInteger DebugToolkitNativeLogsMaxBuffer = 500;
static NSMutableArray<NSDictionary *> *buffer;
static dispatch_queue_t bufferQueue;
static BOOL captureEnabled = NO;
static BOOL logFunctionInstalled = NO;

+ (BOOL)requiresMainQueueSetup { return NO; }

+ (void)initialize {
  if (self == [DebugToolkitNativeLogs class]) {
    buffer = [NSMutableArray new];
    bufferQueue = dispatch_queue_create("com.reactnativedebugtoolkit.nativeLogs", DISPATCH_QUEUE_SERIAL);
  }
}

RCT_EXPORT_METHOD(startCapture:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  dispatch_sync(bufferQueue, ^{
    captureEnabled = YES;
    if (!logFunctionInstalled) {
      logFunctionInstalled = YES;
      RCTAddLogFunction(^(RCTLogLevel level, RCTLogSource source, NSString *fileName, NSNumber *lineNumber, NSString *message) {
        if (!captureEnabled || !message) return;
        NSDictionary *entry = @{
          @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000),
          @"platform": @"ios",
          @"source": @"rctLog",
          @"level": DebugToolkitNativeLogsLevel(level),
          @"message": message,
          @"file": fileName ?: @"",
          @"line": lineNumber ?: @0,
          @"raw": RCTFormatLog([NSDate date], level, fileName, lineNumber, message) ?: message
        };
        dispatch_async(bufferQueue, ^{
          if (buffer.count >= DebugToolkitNativeLogsMaxBuffer) [buffer removeObjectAtIndex:0];
          [buffer addObject:entry];
        });
      });
    }
  });
  resolve(@{@"ok": @YES, @"available": @YES, @"capturing": @YES});
}

RCT_EXPORT_METHOD(stopCapture:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  dispatch_sync(bufferQueue, ^{ captureEnabled = NO; });
  resolve(@{@"ok": @YES, @"available": @YES, @"capturing": @NO});
}

RCT_EXPORT_METHOD(drainLogs:(nonnull NSNumber *)max
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  __block NSArray<NSDictionary *> *drained = @[];
  NSUInteger limit = MAX((NSUInteger)1, max.unsignedIntegerValue);
  dispatch_sync(bufferQueue, ^{
    NSUInteger count = MIN(limit, buffer.count);
    drained = [buffer subarrayWithRange:NSMakeRange(0, count)];
    if (count > 0) [buffer removeObjectsInRange:NSMakeRange(0, count)];
  });
  resolve(drained);
}

RCT_EXPORT_METHOD(getStatus:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject) {
  __block BOOL current = NO;
  dispatch_sync(bufferQueue, ^{ current = captureEnabled; });
  resolve(@{@"available": @YES, @"capturing": @(current)});
}

static NSString *DebugToolkitNativeLogsLevel(RCTLogLevel level) {
  switch (level) {
    case RCTLogLevelTrace: return @"trace";
    case RCTLogLevelInfo: return @"info";
    case RCTLogLevelWarning: return @"warn";
    case RCTLogLevelError: return @"error";
    case RCTLogLevelFatal: return @"fatal";
  }
}

@end
