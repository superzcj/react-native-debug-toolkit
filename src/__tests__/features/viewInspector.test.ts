import { Alert, NativeModules } from 'react-native';
import { configureLocale } from '../../i18n';
import { createViewInspectorFeature } from '../../features/viewInspector';

beforeEach(() => {
  configureLocale('en');
  jest.clearAllMocks();
});

afterEach(() => { delete NativeModules.DebugToolkitViewInspector; });

test('opens the inspector and reports unavailable and native errors', async () => {
  const show = jest.fn()
    .mockResolvedValueOnce('opened')
    .mockResolvedValueOnce('unavailable')
    .mockRejectedValueOnce(new Error('native failure'));
  NativeModules.DebugToolkitViewInspector = { show };
  const feature = createViewInspectorFeature();
  expect(feature.action).toBe(true);

  await feature.onSelect!();
  expect(Alert.alert).not.toHaveBeenCalled();
  await feature.onSelect!();
  expect(Alert.alert).toHaveBeenLastCalledWith('View inspector', expect.stringContaining('not installed'));
  await feature.onSelect!();
  expect(Alert.alert).toHaveBeenLastCalledWith('View inspector', 'native failure');
  delete NativeModules.DebugToolkitViewInspector;
  await feature.onSelect!();
  expect(Alert.alert).toHaveBeenLastCalledWith('View inspector', expect.stringContaining('not installed'));
});
