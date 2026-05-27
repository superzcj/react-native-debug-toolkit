import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

// ---- react-native-camera-kit types ----

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
  CameraType?: { Back?: unknown };
}

// ---- expo-camera types ----

export interface ExpoCameraScanResult {
  boundingBox?: unknown;
  cornerPoints?: unknown;
  type?: string;
  value?: string;
}

export interface ExpoCameraModule {
  Camera: ComponentType<{
    style?: StyleProp<ViewStyle>;
    onBarCodeScanned?: (result: ExpoCameraScanResult) => void;
    barCodeScannerSettings?: { barCodeTypes: string[] };
  }>;
}

// ---- Unified scanner ----

export type ScannerKind = 'camera-kit' | 'expo-camera';

export interface ScannerModule {
  kind: ScannerKind;
  CameraKit?: CameraKitModule;
  ExpoCamera?: ExpoCameraModule;
}

let cached: ScannerModule | null | false = false;

function tryCameraKit(): ScannerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-camera-kit') as Partial<CameraKitModule>;
    if (mod.Camera) {
      return {
        kind: 'camera-kit',
        CameraKit: { Camera: mod.Camera, CameraType: mod.CameraType },
      };
    }
  } catch { /* not installed */ }
  return null;
}

function tryExpoCamera(): ScannerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-camera') as Partial<ExpoCameraModule>;
    if (mod.Camera) {
      return {
        kind: 'expo-camera',
        ExpoCamera: { Camera: mod.Camera },
      };
    }
  } catch { /* not installed */ }
  return null;
}

export function getScannerModule(): ScannerModule | null {
  if (cached !== false) return cached;
  cached = tryCameraKit() ?? tryExpoCamera();
  return cached;
}

export function isCameraKitAvailable(): boolean {
  return getScannerModule() !== null;
}
