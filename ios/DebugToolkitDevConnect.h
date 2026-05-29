#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 Returns a Metro bundle URL when the user has applied one via DevConnect; otherwise nil.

 Swift opt-in usage (call from your ReactNativeDelegate.bundleURL() override):

     override func bundleURL() -> URL? {
       if let metro = DebugToolkitMetroBundleURL() { return metro }
       #if DEBUG
       return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
       #else
       return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
       #endif
     }
 */
FOUNDATION_EXPORT NSURL * _Nullable DebugToolkitMetroBundleURL(void);

NS_ASSUME_NONNULL_END
