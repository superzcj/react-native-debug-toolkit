const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

describe('no old embed compatibility path', () => {
  it('does not ship old embed scripts', () => {
    for (const file of [
      'scripts/embed.js',
      'scripts/embed-ios.js',
      'scripts/embed-android.js',
      'scripts/embed-expo.js',
      'scripts/eas-postinstall.sh',
      'scripts/android-debug-bundle.gradle',
    ]) {
      expect(fs.existsSync(path.join(repoRoot, file))).toBe(false);
    }
  });

  it('bin help does not advertise embed', () => {
    const bin = fs.readFileSync(path.join(repoRoot, 'bin/debug-toolkit.js'), 'utf8');
    expect(bin).not.toContain('debug-toolkit embed');
    expect(bin).toContain('setup-bundle');
    expect(bin).toContain('doctor-bundle');
  });
});
