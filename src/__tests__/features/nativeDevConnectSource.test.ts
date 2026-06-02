import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('native DevConnect source contracts', () => {
  it('exposes preference and device APIs on Android', () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitDevConnectModule.java'),
      'utf8',
    );

    expect(source).toContain('getPreference');
    expect(source).toContain('setPreference');
    expect(source).toContain('isDebugBuild');
    expect(source).toContain('getLocalIp');
  });

  it('exposes preference and device APIs on iOS', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.mm'), 'utf8');

    expect(source).toContain('isDebugBuild');
    expect(source).toContain('getPreference');
    expect(source).toContain('getLocalIp');
  });

  it('exposes the public C API header', () => {
    const header = fs.readFileSync(path.join(repoRoot, 'ios/DebugToolkitDevConnect.h'), 'utf8');
    expect(header).toContain('NS_ASSUME_NONNULL_BEGIN');
  });
});
