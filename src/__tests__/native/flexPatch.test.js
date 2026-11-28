const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const patch = path.resolve(__dirname, '../../../ios/patch_flex.rb');
const runPatch = root => execFileSync('ruby', ['-e', `
  require 'pathname'
  require ARGV[1]
  installer = Struct.new(:sandbox).new(Struct.new(:root).new(Pathname.new(ARGV[0])))
  patch_debug_toolkit_flex(installer)
`, root, patch]);

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'flex-patch-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

test('a pod installation without FLEX skips the patch', () => {
  expect(() => runPatch(root)).not.toThrow();
});

test('the installed FLEX snapshot is patched once', () => {
  const file = path.join(root, 'FLEX/Classes/ViewHierarchy/SnapshotExplorer/FHSView.m');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '+ (UIImage *)_snapshotView:(UIView *)view {\n    UIView *superview\n}');
  runPatch(root);
  const patched = fs.readFileSync(file, 'utf8');
  expect(patched).toContain('if (CGRectIsEmpty(view.bounds)) return nil;');
  runPatch(root);
  expect(fs.readFileSync(file, 'utf8')).toBe(patched);
});
