package com.reactnativedebugtoolkit;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.lang.reflect.Method;

public class RNDoraemonKitBridgeModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "RNDoraemonKitBridge";
  private Class<?> doraemonKitClass = null;

  public RNDoraemonKitBridgeModule(ReactApplicationContext reactContext) {
    super(reactContext);
    try {
      doraemonKitClass = Class.forName("com.didichuxing.doraemonkit.DoraemonKit");
    } catch (ClassNotFoundException ignored) {
    }
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  public static boolean isAvailable() {
    try {
      Class.forName("com.didichuxing.doraemonkit.DoraemonKit");
      return true;
    } catch (ClassNotFoundException e) {
      return false;
    }
  }

  @ReactMethod
  public void installDoraemonKit(String productId, Promise promise) {
    if (doraemonKitClass == null) {
      promise.resolve(false);
      return;
    }
    try {
      Method install = doraemonKitClass.getMethod("install", android.content.Context.class, String.class);
      install.invoke(null, getReactApplicationContext().getApplicationContext(), productId);
      promise.resolve(true);
    } catch (Throwable t) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void showDoraemonKit(Promise promise) {
    if (doraemonKitClass == null) {
      promise.resolve(false);
      return;
    }
    try {
      Method show = doraemonKitClass.getMethod("show");
      show.invoke(null);
      promise.resolve(true);
    } catch (Throwable t) {
      promise.resolve(false);
    }
  }

  @ReactMethod
  public void hideDoraemonKit(Promise promise) {
    if (doraemonKitClass == null) {
      promise.resolve(false);
      return;
    }
    try {
      Method hide = doraemonKitClass.getMethod("hide");
      hide.invoke(null);
      promise.resolve(true);
    } catch (Throwable t) {
      promise.resolve(false);
    }
  }
}
