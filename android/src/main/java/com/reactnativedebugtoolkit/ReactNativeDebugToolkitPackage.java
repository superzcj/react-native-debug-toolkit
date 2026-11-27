package com.reactnativedebugtoolkit;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;

public class ReactNativeDebugToolkitPackage implements ReactPackage {
  @NonNull
  @Override
  public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>(Arrays.<NativeModule>asList(
        new DebugToolkitDevConnectModule(reactContext),
        new DebugToolkitNativeLogsModule(reactContext)));
    if (BuildConfig.DEBUG) modules.add(new DebugToolkitViewInspectorModule(reactContext));
    return modules;
  }

  @NonNull
  @Override
  public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
    return java.util.Collections.emptyList();
  }
}
