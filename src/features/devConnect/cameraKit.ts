import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface CameraKitReadCodeEvent {
  nativeEvent?: {
    codeStringValue?: string;
  };
}

export interface CameraKitCameraProps {
  style?: StyleProp<ViewStyle>;
  cameraType?: unknown;
  scanBarcode?: boolean;
  onReadCode?: (event: CameraKitReadCodeEvent) => void;
  showFrame?: boolean;
  laserColor?: string;
  frameColor?: string;
  allowedBarcodeTypes?: string[];
}

export interface CameraKitModule {
  Camera: ComponentType<CameraKitCameraProps>;
  CameraType?: {
    Back?: unknown;
  };
}

let cachedModule: CameraKitModule | null | false = false;

export function getCameraKitModule(): CameraKitModule | null {
  if (cachedModule !== false) return cachedModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-camera-kit') as Partial<CameraKitModule>;
    if (mod.Camera) {
      cachedModule = {
        Camera: mod.Camera,
        CameraType: mod.CameraType,
      };
      return cachedModule;
    }
  } catch {
    cachedModule = null;
    return null;
  }

  cachedModule = null;
  return null;
}

export function isCameraKitAvailable(): boolean {
  return getCameraKitModule() !== null;
}
