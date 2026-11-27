import { NativeModules } from 'react-native';

type ViewInspectorResult = 'opened' | 'permission_required' | 'unavailable';

export function openViewInspector(): Promise<ViewInspectorResult> {
  const inspector = NativeModules.DebugToolkitViewInspector as { show(): Promise<ViewInspectorResult> } | undefined;
  return inspector ? inspector.show() : Promise.resolve('unavailable');
}
