#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 Returns a Metro bundle URL when the user has applied a host via DevConnect; otherwise nil.

 Zero-config: installing this pod hooks RCTBundleURLProvider so cold start uses the embedded
 main.jsbundle until DevConnect applies a host. You do not need to change AppDelegate.

 Optional override for custom bundleURL() implementations:

     if let metro = DebugToolkitMetroBundleURL() { return metro }
 */
FOUNDATION_EXPORT NSURL * _Nullable DebugToolkitMetroBundleURL(void);

NS_ASSUME_NONNULL_END
