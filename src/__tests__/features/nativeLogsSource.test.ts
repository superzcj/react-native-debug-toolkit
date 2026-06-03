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
});
