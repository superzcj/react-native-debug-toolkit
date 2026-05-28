package com.reactnativedebugtoolkit;

import android.content.Context;
import android.content.SharedPreferences;
import android.preference.PreferenceManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.reactnativedebugtoolkit.BuildConfig;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;

import java.lang.reflect.Method;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;

public class DebugToolkitDevConnectModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "DebugToolkitDevConnect";
  private static final String DEBUG_SERVER_HOST_KEY = "debug_http_host";
  private static final String APPLY_RELOAD_REASON = "DebugToolkit DevConnect Metro host changed";
  private static final String RESET_RELOAD_REASON = "DebugToolkit DevConnect Metro host reset";

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

  @Nullable
  private Object callGetter(Object target, String methodName) {
    try {
      Method method = target.getClass().getMethod(methodName);
      return method.invoke(target);
    } catch (Exception ignored) {
      return null;
    }
  }

  private void setDebugServerHost(@Nullable Object devSupportManager, String hostPort) throws Exception {
    if (devSupportManager == null) {
      return;
    }

    Object devSettings = callGetter(devSupportManager, "getDevSettings");
    Object packagerConnectionSettings = devSettings == null
        ? null
        : callGetter(devSettings, "getPackagerConnectionSettings");
    if (packagerConnectionSettings == null) {
      return;
    }

    Method setter = packagerConnectionSettings.getClass().getMethod("setDebugServerHost", String.class);
    setter.invoke(packagerConnectionSettings, hostPort);
  }

  private boolean triggerDevSupportReload(
      @Nullable Object devSupportManager,
      String hostPort
  ) throws Exception {
    if (devSupportManager == null) {
      return false;
    }

    Object enabled = callGetter(devSupportManager, "getDevSupportEnabled");
    if (enabled instanceof Boolean && !((Boolean) enabled)) {
      return false;
    }

    setDebugServerHost(devSupportManager, hostPort);
    Method reloadMethod = devSupportManager.getClass().getMethod("handleReloadJS");
    reloadMethod.invoke(devSupportManager);
    return true;
  }

  private boolean reloadFromReactHost(
      Context applicationContext,
      String reason,
      String hostPort
  ) throws Exception {
    Object reactHost = callGetter(applicationContext, "getReactHost");
    if (reactHost == null) {
      return false;
    }

    if (triggerDevSupportReload(callGetter(reactHost, "getDevSupportManager"), hostPort)) {
      return true;
    }

    Method reloadMethod = reactHost.getClass().getMethod("reload", String.class);
    reloadMethod.invoke(reactHost, reason);
    return true;
  }

  private boolean reloadFromReactNativeHost(Context applicationContext, String hostPort) throws Exception {
    Object reactNativeHost = callGetter(applicationContext, "getReactNativeHost");
    Object instanceManager = reactNativeHost == null
        ? null
        : callGetter(reactNativeHost, "getReactInstanceManager");
    Object devSupportManager = instanceManager == null
        ? null
        : callGetter(instanceManager, "getDevSupportManager");
    return triggerDevSupportReload(devSupportManager, hostPort);
  }

  private void resolveAfterReload(
      String reason,
      @Nullable WritableMap result,
      String hostPort,
      Promise promise
  ) {
    UiThreadUtil.runOnUiThread(() -> {
      try {
        Context applicationContext = getReactApplicationContext().getApplicationContext();
        boolean reloaded = reloadFromReactHost(applicationContext, reason, hostPort)
            || reloadFromReactNativeHost(applicationContext, hostPort);
        if (!reloaded) {
          promise.reject("reload_unavailable", "Unable to trigger React Native reload after updating Metro host.");
          return;
        }
        promise.resolve(result);
      } catch (Exception error) {
        promise.reject("reload_failed", "Unable to trigger React Native reload after updating Metro host.", error);
      }
    });
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

    boolean stored = getPreferences().edit().putString(DEBUG_SERVER_HOST_KEY, hostPort).commit();
    if (!stored) {
      promise.reject("storage_failed", "Unable to persist Metro host.");
      return;
    }

    WritableMap result = Arguments.createMap();
    result.putString("hostPort", hostPort);
    resolveAfterReload(APPLY_RELOAD_REASON, result, hostPort, promise);
  }

  @ReactMethod
  public void resetMetroHost(Promise promise) {
    boolean stored = getPreferences().edit().remove(DEBUG_SERVER_HOST_KEY).commit();
    if (!stored) {
      promise.reject("storage_failed", "Unable to reset Metro host.");
      return;
    }

    resolveAfterReload(RESET_RELOAD_REASON, null, "", promise);
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
  public void getLocalIp(Promise promise) {
    try {
      Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
      String fallback = null;
      while (interfaces != null && interfaces.hasMoreElements()) {
        NetworkInterface iface = interfaces.nextElement();
        if (iface.isLoopback() || !iface.isUp()) continue;
        String name = iface.getName();
        Enumeration<InetAddress> addresses = iface.getInetAddresses();
        while (addresses.hasMoreElements()) {
          InetAddress addr = addresses.nextElement();
          if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
            String ip = addr.getHostAddress();
            if (name != null && (name.startsWith("wlan") || name.startsWith("eth"))) {
              promise.resolve(ip);
              return;
            }
            if (fallback == null) {
              fallback = ip;
            }
          }
        }
      }
      promise.resolve(fallback);
    } catch (Exception e) {
      promise.resolve(null);
    }
  }
}
