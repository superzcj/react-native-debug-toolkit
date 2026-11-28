package com.reactnativedebugtoolkit;

import android.app.Activity;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;
import java.lang.ref.WeakReference;

public class DebugToolkitViewInspectorModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
  private WeakReference<ViewInspectorOverlay> activeOverlay = new WeakReference<>(null);
  private WeakReference<Activity> activeActivity = new WeakReference<>(null);

  public DebugToolkitViewInspectorModule(ReactApplicationContext context) {
    super(context);
    context.addLifecycleEventListener(this);
  }

  @NonNull
  @Override
  public String getName() {
    return "DebugToolkitViewInspector";
  }

  @ReactMethod
  public void show(Promise promise) {
    UiThreadUtil.runOnUiThread(() -> {
      try {
        Activity activity = getReactApplicationContext().getCurrentActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
          promise.resolve("unavailable");
          return;
        }

        ViewInspectorOverlay existing = activeOverlay.get();
        Activity existingActivity = activeActivity.get();
        if (existing != null && existing.getParent() != null) {
          if (existingActivity == activity) {
            existing.attach();
            promise.resolve("opened");
            return;
          }
          existing.dismiss();
        }

        ViewInspectorOverlay overlay = new ViewInspectorOverlay(activity, () -> {
          activeOverlay = new WeakReference<>(null);
          activeActivity = new WeakReference<>(null);
        });
        activeOverlay = new WeakReference<>(overlay);
        activeActivity = new WeakReference<>(activity);
        overlay.attach();
        promise.resolve("opened");
      } catch (RuntimeException error) {
        promise.reject("E_VIEW_INSPECTOR", error);
      }
    });
  }

  private void dismissActiveOverlay() {
    UiThreadUtil.runOnUiThread(() -> {
      ViewInspectorOverlay overlay = activeOverlay.get();
      if (overlay != null) {
        overlay.dismiss();
      }
      activeOverlay = new WeakReference<>(null);
      activeActivity = new WeakReference<>(null);
    });
  }

  @Override
  public void onHostResume() {}

  @Override
  public void onHostPause() {}

  @Override
  public void onHostDestroy() {
    dismissActiveOverlay();
  }

  @Override
  public void invalidate() {
    getReactApplicationContext().removeLifecycleEventListener(this);
    dismissActiveOverlay();
    super.invalidate();
  }
}
