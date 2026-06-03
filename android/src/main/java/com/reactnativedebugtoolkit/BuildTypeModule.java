package com.reactnativedebugtoolkit;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = BuildTypeModule.NAME)
public class BuildTypeModule extends ReactContextBaseJavaModule {
  static final String NAME = "BuildTypeModule";

  public BuildTypeModule(@NonNull com.facebook.react.bridge.ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void getBuildType(Promise promise) {
    promise.resolve(BuildConfig.BUILD_TYPE);
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String getBuildTypeSync() {
    return BuildConfig.BUILD_TYPE;
  }
}
