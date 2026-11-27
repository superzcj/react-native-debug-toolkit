def patch_debug_toolkit_flex(installer)
  # FLEX 5.22.10 crashes on iOS 26 when a view has zero-size bounds.
  snapshot_path = installer.sandbox.root + 'FLEX/Classes/ViewHierarchy/SnapshotExplorer/FHSView.m'
  source = File.read(snapshot_path)
  return if source.include?('if (CGRectIsEmpty(view.bounds)) return nil;')

  patched = source.sub("+ (UIImage *)_snapshotView:(UIView *)view {\n    UIView *superview",
                       "+ (UIImage *)_snapshotView:(UIView *)view {\n    if (CGRectIsEmpty(view.bounds)) return nil;\n    UIView *superview")
  raise 'Unable to patch FLEX snapshot for zero-size views' if patched == source

  mode = File.stat(snapshot_path).mode
  File.chmod(mode | 0o200, snapshot_path)
  File.write(snapshot_path, patched)
  File.chmod(mode, snapshot_path)
end
