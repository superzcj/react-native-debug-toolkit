import { Alert, NativeModules } from 'react-native';
import type { DebugFeature } from '../../types/feature';
import { t } from '../../i18n';

type ViewInspectorResult = 'opened' | 'unavailable';

export function createViewInspectorFeature(): DebugFeature<null> {
  return {
    name: 'viewInspector',
    label: 'View inspector',
    action: true,
    status: { phase: 'initializing', issues: [] },
    setup() {},
    cleanup() {},
    getSnapshot: () => null,
    async onSelect() {
      try {
        const inspector = NativeModules.DebugToolkitViewInspector as { show(): Promise<ViewInspectorResult> } | undefined;
        const result = inspector ? await inspector.show() : 'unavailable';
        if (result === 'unavailable') Alert.alert(t('viewInspector.title'), t('viewInspector.unavailable'));
      } catch (error) {
        Alert.alert(t('viewInspector.title'), error instanceof Error ? error.message : String(error));
      }
    },
  };
}
