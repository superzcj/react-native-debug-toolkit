package com.reactnativedebugtoolkit;

import android.content.SharedPreferences;
import android.preference.PreferenceManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class DebugToolkitDevConnectModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "DebugToolkitDevConnect";
  private static final String DEBUG_SERVER_HOST_KEY = "debug_http_host";

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
  public void getMetroHost(Promise promise) {
    @Nullable String host = getPreferences().getString(DEBUG_SERVER_HOST_KEY, null);
    promise.resolve(host);
  }

  @ReactMethod
  public void applyMetroHost(String hostPort, Promise promise) {
    if (hostPort == null || hostPort.length() == 0) {
      promise.reject("invalid_host", "Metro host cannot be empty.");
      return;
    }

    getPreferences().edit().putString(DEBUG_SERVER_HOST_KEY, hostPort).apply();
    WritableMap result = Arguments.createMap();
    result.putString("hostPort", hostPort);
    promise.resolve(result);
  }

  @ReactMethod
  public void resetMetroHost(Promise promise) {
    getPreferences().edit().remove(DEBUG_SERVER_HOST_KEY).apply();
    promise.resolve(null);
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
}
