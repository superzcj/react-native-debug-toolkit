import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('native logs source contracts', () => {
  it('exposes iOS native logs module through RCTAddLogFunction', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitNativeLogs.mm'), 'utf8');
    expect(source).toContain('RCT_EXPORT_MODULE(DebugToolkitNativeLogs)');
    expect(source).toContain('RCTAddLogFunction');
    expect(source).toContain('startCapture');
    expect(source).toContain('drainLogs');
    expect(source).toContain('stopCapture');
    expect(source).toContain('captureEnabled');
  });

  it('exposes Android native logs module with current process logcat capture', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitNativeLogsModule.java'),
      'utf8',
    );
    expect(source).toContain('MODULE_NAME = "DebugToolkitNativeLogs"');
    expect(source).toContain('startCapture');
    expect(source).toContain('drainLogs');
    expect(source).toContain('stopCapture');
    expect(source).toContain('Process.myPid()');
    expect(source).toContain('logcat');
  });

  it('registers DevConnect and NativeLogs Android modules', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'android/src/main/java/com/reactnativedebugtoolkit/ReactNativeDebugToolkitPackage.java'),
      'utf8',
    );
    expect(source).toContain('new DebugToolkitDevConnectModule(reactContext)');
    expect(source).toContain('new DebugToolkitNativeLogsModule(reactContext)');
  });
});
