package com.reactnativedebugtoolkit;

import android.os.Process;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DebugToolkitNativeLogsModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "DebugToolkitNativeLogs";
  private static final int MAX_BUFFER = 500;
  private static final Pattern THREADTIME = Pattern.compile(
      "^\\s*(\\d+-\\d+)\\s+(\\d+:\\d+:\\d+\\.\\d+)\\s+(\\d+)\\s+(\\d+)\\s+([VDIWEF])\\s+([^:]+):\\s?(.*)$");

  private final Object lock = new Object();
  private final ArrayDeque<WritableMap> buffer = new ArrayDeque<>();
  private java.lang.Process logcatProcess;
  private Thread readerThread;
  private boolean capturing = false;
  private String lastError = null;

  public DebugToolkitNativeLogsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() { return MODULE_NAME; }

  @ReactMethod
  public void startCapture(ReadableMap options, Promise promise) {
    synchronized (lock) {
      if (capturing) { promise.resolve(statusMap(true)); return; }
      capturing = true;
      lastError = null;
    }
    readerThread = new Thread(() -> readLogcat(), "DebugToolkitNativeLogs");
    readerThread.setDaemon(true);
    readerThread.start();
    promise.resolve(statusMap(true));
  }

  @ReactMethod
  public void stopCapture(Promise promise) {
    synchronized (lock) {
      capturing = false;
      if (logcatProcess != null) { logcatProcess.destroy(); logcatProcess = null; }
    }
    promise.resolve(statusMap(false));
  }

  @ReactMethod
  public void drainLogs(double max, Promise promise) {
    int limit = Math.max(1, (int) Math.floor(max));
    WritableArray drained = Arguments.createArray();
    synchronized (lock) {
      while (!buffer.isEmpty() && limit > 0) { drained.pushMap(buffer.removeFirst()); limit--; }
    }
    promise.resolve(drained);
  }

  @ReactMethod
  public void getStatus(Promise promise) {
    synchronized (lock) {
      WritableMap status = statusMap(capturing);
      if (lastError != null) status.putString("error", lastError);
      promise.resolve(status);
    }
  }

  private WritableMap statusMap(boolean isCapturing) {
    WritableMap map = Arguments.createMap();
    map.putBoolean("ok", true);
    map.putBoolean("available", true);
    map.putBoolean("capturing", isCapturing);
    return map;
  }

  private void readLogcat() {
    int pid = Process.myPid();
    try {
      ProcessBuilder builder = new ProcessBuilder("logcat", "-v", "threadtime", "--pid", String.valueOf(pid));
      logcatProcess = builder.redirectErrorStream(true).start();
      BufferedReader reader = new BufferedReader(new InputStreamReader(logcatProcess.getInputStream()));
      String line;
      while (isCapturing() && (line = reader.readLine()) != null) {
        WritableMap entry = parseLine(line, pid);
        if (entry != null) push(entry);
      }
    } catch (Exception error) {
      synchronized (lock) { lastError = error.getMessage(); }
    } finally {
      synchronized (lock) { capturing = false; logcatProcess = null; }
    }
  }

  private boolean isCapturing() { synchronized (lock) { return capturing; } }

  private void push(WritableMap entry) {
    synchronized (lock) {
      while (buffer.size() >= MAX_BUFFER) buffer.removeFirst();
      buffer.addLast(entry);
    }
  }

  private WritableMap parseLine(String line, int pid) {
    Matcher m = THREADTIME.matcher(line);
    if (!m.matches()) return null;
    if (Integer.parseInt(m.group(3)) != pid) return null;
    WritableMap entry = Arguments.createMap();
    entry.putDouble("timestamp", System.currentTimeMillis());
    entry.putString("platform", "android");
    entry.putString("source", "logcat");
    entry.putString("level", levelFromPriority(m.group(5)));
    entry.putString("thread", m.group(4));
    entry.putString("tag", m.group(6).trim());
    entry.putString("message", m.group(7));
    entry.putString("raw", line);
    return entry;
  }

  private String levelFromPriority(String priority) {
    String p = priority == null ? "" : priority.toUpperCase(Locale.US);
    switch (p) {
      case "V": return "trace";
      case "D": return "debug";
      case "I": return "info";
      case "W": return "warn";
      case "E": return "error";
      case "F": return "fatal";
      default: return "unknown";
    }
  }
}
