import { Platform } from 'react-native';

export function isSimulator(): boolean {
  const { OS } = Platform;

  if (OS === 'android') {
    const constants = Platform.constants as Record<string, unknown>;
    if (constants.isEmulator === true) return true;
    const model = String(constants.Model ?? '').toLowerCase();
    return model.includes('sdk') || model.includes('emulator') || model.includes('google_sdk');
  }

  if (OS === 'ios') {
    const model = String(
      (Platform.constants as Record<string, unknown>).model ?? '',
    ).toLowerCase();
    return model.includes('simulator');
  }

  return false;
}
