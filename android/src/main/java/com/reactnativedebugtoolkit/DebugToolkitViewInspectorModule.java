package com.reactnativedebugtoolkit;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;

public class DebugToolkitViewInspectorModule extends ReactContextBaseJavaModule {
  public DebugToolkitViewInspectorModule(ReactApplicationContext context) { super(context); }

  @NonNull
  @Override
  public String getName() { return "DebugToolkitViewInspector"; }

  @ReactMethod
  public void show(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      try {
        Class<?> tool = Class.forName("me.ele.uetool.UETool");
        boolean opened = (Boolean) tool.getMethod("showUETMenu").invoke(null);
        promise.resolve(opened ? "opened" : "permission_required");
      } catch (ClassNotFoundException error) {
        promise.resolve("unavailable");
      } catch (ReflectiveOperationException error) {
        promise.reject("E_VIEW_INSPECTOR", error);
      }
    });
  }
}
