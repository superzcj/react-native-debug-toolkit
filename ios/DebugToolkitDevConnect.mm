#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBundleManager.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTDefines.h>
#import <React/RCTReloadCommand.h>
#import <objc/runtime.h>
#include <ifaddrs.h>
#include <arpa/inet.h>
#include <net/if.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <errno.h>
#include <unistd.h>

static NSString *const DebugToolkitBundleRoot = @"index";
static NSString *const kDevConnectMetroHost = @"_devconnect_metro_host";
static NSString *const kDevConnectDiagLog = @"_devconnect_diag_log";

// Swizzle state — forward-declared so appendDiag can reference them.
static IMP original_bundleURL = NULL;          // RN 0.73+ new arch: -[AppDelegate bundleURL]
static IMP original_sourceURLForBridge = NULL; // Legacy bridge: -[AppDelegate sourceURLForBridge:]
static IMP original_URLForResource = NULL;     // NSBundle hook: catches Release [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"]
static BOOL swizzleInvoked = NO;
static BOOL nsBundleInvoked = NO;

static void appendDiag(NSString *stage, NSString *detail)
{
  NSString *msg = [NSString stringWithFormat:@"[%@] %@ | bundleURL=%@ sourceURL=%@ NSBundle=%@/%@ inv=%@",
                   stage, detail,
                   original_bundleURL ? @"Y" : @"N",
                   original_sourceURLForBridge ? @"Y" : @"N",
                   original_URLForResource ? @"Y" : @"N",
                   nsBundleInvoked ? @"Y" : @"N",
                   swizzleInvoked ? @"Y" : @"N"];
  NSMutableArray *log = [[[NSUserDefaults standardUserDefaults] arrayForKey:kDevConnectDiagLog] mutableCopy]
                        ?: [NSMutableArray new];
  [log addObject:msg];
  if (log.count > 40) [log removeObjectAtIndex:0];
  [[NSUserDefaults standardUserDefaults] setObject:[log copy] forKey:kDevConnectDiagLog];
  [[NSUserDefaults standardUserDefaults] synchronize];
  NSLog(@"[DevConnect] %@", msg);
}

// Builds a direct Metro bundle URL — deliberately avoids jsBundleURLForBundleRoot: which does
// a synchronous packager reachability check and returns nil in Release when Metro isn't local.
static NSURL *buildMetroURL(NSString *metroHost)
{
  NSString *urlStr = [NSString stringWithFormat:
      @"http://%@/%@.bundle?platform=ios&dev=true&minify=false", metroHost, DebugToolkitBundleRoot];
  return [NSURL URLWithString:urlStr];
}

#pragma mark - Metro Reachability (synchronous, used inside NSBundle hook)

// Synchronous TCP probe on host:port with a tight timeout.
// Deliberately avoids any ObjC/Foundation that could re-enter the NSBundle hook.
static BOOL isMetroHostReachable(NSString *hostPort, int timeoutMs)
{
  if (!hostPort.length) return NO;

  NSRange sep = [hostPort rangeOfString:@":" options:NSBackwardsSearch];
  const char *hostCStr;
  int port;
  if (sep.location == NSNotFound) {
    hostCStr = hostPort.UTF8String;
    port = 8081;
  } else {
    hostCStr = [[hostPort substringToIndex:sep.location] UTF8String];
    port = [[hostPort substringFromIndex:sep.location + 1] intValue];
  }
  if (!hostCStr || port <= 0 || port > 65535) return NO;
  if (strcmp(hostCStr, "localhost") == 0) hostCStr = "127.0.0.1";

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  if (inet_pton(AF_INET, hostCStr, &addr.sin_addr) != 1) return NO;

  int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (fd < 0) return NO;

  int flags = fcntl(fd, F_GETFL, 0);
  fcntl(fd, F_SETFL, flags | O_NONBLOCK);

  connect(fd, (struct sockaddr *)&addr, sizeof(addr));

  fd_set wfds; FD_ZERO(&wfds); FD_SET(fd, &wfds);
  struct timeval tv = { 0, (__darwin_suseconds_t)(timeoutMs * 1000) };
  BOOL reachable = NO;
  if (select(fd + 1, NULL, &wfds, NULL, &tv) > 0) {
    int err = 0; socklen_t len = sizeof(err);
    getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &len);
    reachable = (err == 0);
  }
  close(fd);
  return reachable;
}

#pragma mark - NSBundle Swizzle (universal Release hook)

// Intercepts [[NSBundle mainBundle] URLForResource:name withExtension:@"jsbundle"] in Release.
// ONLY matches the "jsbundle" extension — never ".js" which is used by WebKit/JSC at startup.
// Guards with a TCP reachability check so a stale persisted host doesn't crash the app.
static NSURL *devconnect_URLForResource(id self, SEL _cmd, NSString *name, NSString *ext)
{
  if ([ext isEqualToString:@"jsbundle"]) {
    NSString *metroHost = [[NSUserDefaults standardUserDefaults] stringForKey:kDevConnectMetroHost];
    if (metroHost.length > 0 && isMetroHostReachable(metroHost, 150)) {
      nsBundleInvoked = YES;
      NSLog(@"[DevConnect] NSBundle hook: %@.jsbundle → metro:%@", name, metroHost);
      return buildMetroURL(metroHost);
    }
  }
  return ((NSURL *(*)(id, SEL, NSString *, NSString *))original_URLForResource)(self, _cmd, name, ext);
}

#pragma mark - AppDelegate Swizzling

// RN 0.73+ new arch pattern: AppDelegate overrides -bundleURL (no bridge argument).
static NSURL *devconnect_bundleURL(id self, SEL _cmd)
{
  swizzleInvoked = YES;
  NSString *metroHost = [[NSUserDefaults standardUserDefaults] stringForKey:kDevConnectMetroHost];
  if (metroHost.length > 0) {
    NSURL *url = buildMetroURL(metroHost);
    appendDiag(@"bundleURL-called", [NSString stringWithFormat:@"host=%@", metroHost]);
    return url;
  }
  if (original_bundleURL) {
    return ((NSURL *(*)(id, SEL))original_bundleURL)(self, _cmd);
  }
  return nil;
}

// Legacy bridge pattern: -sourceURLForBridge:(RCTBridge *)bridge
static NSURL *devconnect_sourceURLForBridge(id self, SEL _cmd, RCTBridge *bridge)
{
  swizzleInvoked = YES;
  NSString *metroHost = [[NSUserDefaults standardUserDefaults] stringForKey:kDevConnectMetroHost];
  if (metroHost.length > 0) {
    NSURL *url = buildMetroURL(metroHost);
    appendDiag(@"sourceURLForBridge-called", [NSString stringWithFormat:@"host=%@", metroHost]);
    return url;
  }
  if (original_sourceURLForBridge) {
    return ((NSURL *(*)(id, SEL, RCTBridge *))original_sourceURLForBridge)(self, _cmd, bridge);
  }
  return nil;
}

static void swizzleMethod(Class targetClass, SEL selector, IMP replacement, IMP *original, NSString *stage)
{
  NSString *selName = NSStringFromSelector(selector);
  if (!targetClass) {
    appendDiag(stage, [NSString stringWithFormat:@"sel=%@ class=nil", selName]);
    return;
  }
  NSString *className = NSStringFromClass(targetClass);
  if (*original) {
    appendDiag(stage, [NSString stringWithFormat:@"sel=%@ class=%@ already_done", selName, className]);
    return;
  }
  Method method = class_getInstanceMethod(targetClass, selector);
  if (!method) {
    appendDiag(stage, [NSString stringWithFormat:@"sel=%@ class=%@ NOT_FOUND", selName, className]);
    return;
  }
  IMP origIMP = method_getImplementation(method);
  const char *types = method_getTypeEncoding(method);
  // class_addMethod stamps the IMP on targetClass directly even when method is inherited,
  // avoiding accidental modification of a parent class's implementation table.
  BOOL added = class_addMethod(targetClass, selector, replacement, types);
  if (!added) {
    method_setImplementation(class_getInstanceMethod(targetClass, selector), replacement);
  }
  *original = origIMP;
  appendDiag(stage, [NSString stringWithFormat:@"sel=%@ class=%@ added=%@ OK", selName, className, added ? @"Y" : @"N"]);
}

static void swizzleAppDelegate(Class cls, NSString *stage)
{
  swizzleMethod(cls, @selector(bundleURL), (IMP)devconnect_bundleURL, &original_bundleURL, stage);
  swizzleMethod(cls, @selector(sourceURLForBridge:), (IMP)devconnect_sourceURLForBridge, &original_sourceURLForBridge, stage);
}

#pragma mark - Module

@interface DebugToolkitDevConnect : NSObject <RCTBridgeModule>
@end

@implementation DebugToolkitDevConnect

RCT_EXPORT_MODULE(DebugToolkitDevConnect)

@synthesize bridge = _bridge;
@synthesize bundleManager = _bundleManager;

__attribute__((constructor))
static void devconnect_swizzle_init(void)
{
  // NSBundle swizzle is the universal fallback: catches [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"]
  // regardless of AppDelegate type. Must run before any +load or class init.
  swizzleMethod([NSBundle class], @selector(URLForResource:withExtension:),
                (IMP)devconnect_URLForResource, &original_URLForResource, @"ctor-NSBundle");
  swizzleAppDelegate(NSClassFromString(@"AppDelegate"), @"ctor");
}

- (instancetype)init
{
  if ((self = [super init])) {
    // Fallback for Swift AppDelegates or custom class names where NSClassFromString fails at ctor time.
    if (!original_bundleURL && !original_sourceURLForBridge) {
      Class delegateClass = object_getClass([UIApplication sharedApplication].delegate);
      swizzleAppDelegate(delegateClass, @"init");
    }
  }
  return self;
}

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

#pragma mark - Exported Methods

RCT_EXPORT_METHOD(getMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    // kDevConnectMetroHost is written by applyMetroHost and survives restart in both Debug+Release.
    // jsLocation is only meaningful in Debug (bypassed in Release); use it as a fallback only.
    NSString *persisted = [[NSUserDefaults standardUserDefaults] stringForKey:kDevConnectMetroHost];
    NSString *jsLocation = [RCTBundleURLProvider sharedSettings].jsLocation;
    NSString *host = persisted.length > 0 ? persisted : jsLocation;
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
    if (hostPort.length == 0) {
      reject(@"invalid_host", @"Metro host cannot be empty.", nil);
      return;
    }

    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];

    // Parse host and port
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
#ifdef RCT_METRO_PORT
      portNumber = [NSNumber numberWithInt:RCT_METRO_PORT];
#else
      portNumber = [NSNumber numberWithInt:8081];
#endif
    }

    NSString *normalizedHostPort = [NSString stringWithFormat:@"%@:%d", host, portNumber.intValue];

    // Persist — read by swizzled bundleURL/sourceURLForBridge: on next load (works in Release).
    [[NSUserDefaults standardUserDefaults] setObject:normalizedHostPort forKey:kDevConnectMetroHost];
    [[NSUserDefaults standardUserDefaults] synchronize];

    // Also set jsLocation for Debug hot-reload path.
    settings.jsLocation = normalizedHostPort;

    // Build URL directly — jsBundleURLForBundleRoot: does a packager reachability check that
    // returns nil in Release when Metro isn't on localhost, defeating the hot-switch.
    NSURL *bundleURL = buildMetroURL(normalizedHostPort);

    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm) {
      bm.bundleURL = bundleURL;
    }
#ifdef RCTReloadCommandSetBundleURL
    else {
      RCTReloadCommandSetBundleURL(bundleURL);
    }
#endif

    appendDiag(@"applyMetroHost", [NSString stringWithFormat:@"host=%@ bm=%@ url=%@",
               normalizedHostPort, bm ? @"YES" : @"nil", bundleURL]);

    RCTTriggerReloadCommandListeners(@"Dev menu - apply changes");

    NSMutableDictionary *result = [@{@"hostPort" : normalizedHostPort} mutableCopy];
    if (bm && bm.bundleURL.absoluteString) {
      result[@"bundleURL"] = bm.bundleURL.absoluteString;
    }
    resolve(result);
  } @catch (NSException *exception) {
    NSLog(@"[DevConnect] applyMetroHost EXCEPTION: %@", exception.reason);
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(resetMetroHost:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  @try {
    // Clear stored Metro host
    [[NSUserDefaults standardUserDefaults] removeObjectForKey:kDevConnectMetroHost];
    [[NSUserDefaults standardUserDefaults] synchronize];

    // Reset RN settings
    RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];
    [settings resetToDefaults];
    NSURL *bundleURL = [settings jsBundleURLForFallbackExtension:nil];

    RCTBundleManager *bm = [self resolveBundleManager];
    if (bm) {
      bm.bundleURL = bundleURL;
    }

    NSLog(@"[DevConnect] resetMetroHost | bm=%@ | url=%@", bm ? @"YES" : @"nil", bundleURL);
    RCTTriggerReloadCommandListeners(@"Dev menu - reset to default");
    resolve([NSNull null]);
  } @catch (NSException *exception) {
    NSLog(@"[DevConnect] resetMetroHost EXCEPTION: %@", exception.reason);
    reject(@"native_error", exception.reason, nil);
  }
}

RCT_EXPORT_METHOD(getDiagnostics:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  NSArray *log = [[NSUserDefaults standardUserDefaults] arrayForKey:kDevConnectDiagLog] ?: @[];
  NSString *metroHost = [[NSUserDefaults standardUserDefaults] stringForKey:kDevConnectMetroHost];
  BOOL installed = (original_bundleURL != NULL) || (original_sourceURLForBridge != NULL) || (original_URLForResource != NULL);
  resolve(@{
    @"log": log,
    @"swizzleInstalled": @(installed),
    @"swizzleBundleURL": @(original_bundleURL != NULL),
    @"swizzleSourceURL": @(original_sourceURLForBridge != NULL),
    @"swizzleNSBundle": @(original_URLForResource != NULL),
    @"swizzleInvoked": @(swizzleInvoked || nsBundleInvoked),
    @"swizzleNSBundleInvoked": @(nsBundleInvoked),
    @"persistedMetroHost": metroHost ?: [NSNull null],
  });
}

RCT_EXPORT_METHOD(clearDiagnostics:(RCTPromiseResolveBlock)resolve
                  rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:kDevConnectDiagLog];
  [[NSUserDefaults standardUserDefaults] synchronize];
  resolve([NSNull null]);
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
