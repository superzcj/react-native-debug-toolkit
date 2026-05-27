import { NativeModules, Platform } from 'react-native';

export function isSimulator(): boolean {
  const { OS } = Platform;

  if (OS === 'android') {
    const constants = Platform.constants as Record<string, unknown>;
    if (constants.isEmulator === true) return true;
    const model = String(constants.Model ?? '').toLowerCase();
    return model.includes('sdk') || model.includes('emulator') || model.includes('google_sdk');
  }

  if (OS === 'ios') {
    // NativeModules.KCKFCSupportManager is absent on simulator,
    // but the most reliable check is the DeviceInfo model name.
    const deviceInfo = NativeModules.DeviceInfo
      ?? NativeModules.PlatformConstants;
    if (deviceInfo) {
      const model = String(deviceInfo.model ?? '').toLowerCase();
      if (model.includes('simulator')) return true;
    }
    return false;
  }

  return false;
}
