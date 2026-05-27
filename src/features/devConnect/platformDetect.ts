import { Platform } from 'react-native';

export function isSimulator(): boolean {
  const { OS } = Platform;
  const constants = (Platform.constants ?? {}) as Record<string, unknown>;

  if (OS === 'android') {
    if (constants.isEmulator === true) {
      return true;
    }
    const model = String(constants.Model ?? constants.model ?? '').toLowerCase();
    return model.includes('sdk') || model.includes('emulator') || model.includes('google_sdk');
  }

  if (OS === 'ios') {
    const model = String(constants.model ?? '').toLowerCase();
    return model.includes('simulator');
  }

  return false;
}
