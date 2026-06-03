import { NativeModules, Platform } from 'react-native';

interface RNFLEXBridgeType {
  showExplorer?(): Promise<boolean>;
  hideExplorer?(): Promise<boolean>;
  toggleExplorer?(): Promise<boolean>;
}

interface RNDoraemonKitBridgeType {
  installDoraemonKit?(productId: string): Promise<boolean>;
  showDoraemonKit?(): Promise<boolean>;
  hideDoraemonKit?(): Promise<boolean>;
}

interface BuildTypeModuleType {
  getBuildType(): Promise<string | null>;
  getBuildTypeSync(): string | null;
}

const RNFLEXBridge: RNFLEXBridgeType = NativeModules.RNFLEXBridge ?? {};
const RNDoraemonKitBridge: RNDoraemonKitBridgeType = NativeModules.RNDoraemonKitBridge ?? {};
const BuildTypeModule: BuildTypeModuleType | null = NativeModules.BuildTypeModule ?? null;

export const NativeDebugLibs = {
  // Availability detection
  isFLEXAvailable(): boolean {
    return Platform.OS === 'ios' && !!RNFLEXBridge.showExplorer;
  },

  isDoraemonKitAvailable(): boolean {
    return !!RNDoraemonKitBridge.showDoraemonKit;
  },

  // Build type
  getBuildType(): Promise<string | null> {
    if (BuildTypeModule) {
      return BuildTypeModule.getBuildType();
    }
    return Promise.resolve(null);
  },

  getBuildTypeSync(): string | null {
    if (BuildTypeModule) {
      return BuildTypeModule.getBuildTypeSync();
    }
    return null;
  },

  isDebugBuild(): boolean {
    if (BuildTypeModule) {
      return BuildTypeModule.getBuildTypeSync() === 'debug';
    }
    return __DEV__;
  },

  // FLEX (iOS only)
  showExplorer(): void {
    if (Platform.OS === 'ios' && RNFLEXBridge.showExplorer) {
      RNFLEXBridge.showExplorer();
    }
  },

  hideExplorer(): void {
    if (Platform.OS === 'ios' && RNFLEXBridge.hideExplorer) {
      RNFLEXBridge.hideExplorer();
    }
  },

  toggleExplorer(): void {
    if (Platform.OS === 'ios' && RNFLEXBridge.toggleExplorer) {
      RNFLEXBridge.toggleExplorer();
    }
  },

  // DoraemonKit
  installDoraemonKit(productId: string = ''): void {
    if (RNDoraemonKitBridge.installDoraemonKit) {
      RNDoraemonKitBridge.installDoraemonKit(productId);
    }
  },

  showDoraemonKit(): void {
    if (RNDoraemonKitBridge.showDoraemonKit) {
      RNDoraemonKitBridge.showDoraemonKit();
    }
  },

  hideDoraemonKit(): void {
    if (RNDoraemonKitBridge.hideDoraemonKit) {
      RNDoraemonKitBridge.hideDoraemonKit();
    }
  },
};
