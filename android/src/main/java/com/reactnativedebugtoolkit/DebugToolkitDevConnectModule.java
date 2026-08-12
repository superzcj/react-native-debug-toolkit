package com.reactnativedebugtoolkit;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.preference.PreferenceManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.reactnativedebugtoolkit.BuildConfig;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;


public class DebugToolkitDevConnectModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "DebugToolkitDevConnect";

  public DebugToolkitDevConnectModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  private SharedPreferences getPreferences() {
    return PreferenceManager.getDefaultSharedPreferences(getReactApplicationContext());
  }

  @ReactMethod
  public void getPreference(String key, Promise promise) {
    @Nullable String value = getPreferences().getString(key, null);
    promise.resolve(value);
  }

  @ReactMethod
  public void setPreference(String key, String value, Promise promise) {
    getPreferences().edit().putString(key, value).apply();
    promise.resolve(null);
  }

  @ReactMethod
  public void isDebugBuild(Promise promise) {
    promise.resolve("debug".equals(BuildConfig.BUILD_TYPE));
  }

  @ReactMethod
  public void getAppInfo(Promise promise) {
    try {
      Context context = getReactApplicationContext();
      PackageInfo packageInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
      com.facebook.react.bridge.WritableMap info = Arguments.createMap();
      info.putString("nativeApplicationId", context.getPackageName());
      info.putString("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
      info.putString("model", Build.MODEL == null ? "" : Build.MODEL);
      info.putString("osVersion", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
      info.putString("appVersion", packageInfo.versionName == null ? "" : packageInfo.versionName);
      info.putString("buildNumber", String.valueOf(packageInfo.versionCode));
      promise.resolve(info);
    } catch (Exception e) {
      promise.resolve(null);
    }
  }
}
