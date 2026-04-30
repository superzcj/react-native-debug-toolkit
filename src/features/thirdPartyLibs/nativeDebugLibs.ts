import { NativeModules, Platform } from 'react-native';

interface RNDebugLibsType {
  showExplorer?(): void;
  hideExplorer?(): void;
  toggleExplorer?(): void;
  installDoraemonKit?(productId: string): void;
  showDoraemonKit?(): void;
  hideDoraemonKit?(): void;
}

interface BuildTypeModuleType {
  getBuildType(): Promise<string | null>;
  getBuildTypeSync(): string | null;
}

const RNDebugLibs: RNDebugLibsType = NativeModules.RNDebugLibs ?? {};
const BuildTypeModule: BuildTypeModuleType | null = NativeModules.BuildTypeModule ?? null;

export const NativeDebugLibs = {
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
    // Fallback: assume __DEV__ is the source of truth
    return __DEV__;
  },

  // FLEX (iOS only)
  showExplorer(): void {
    if (Platform.OS === 'ios' && RNDebugLibs.showExplorer) {
      RNDebugLibs.showExplorer();
    }
  },

  hideExplorer(): void {
    if (Platform.OS === 'ios' && RNDebugLibs.hideExplorer) {
      RNDebugLibs.hideExplorer();
    }
  },

  // DoraemonKit
  installDoraemonKit(productId: string): void {
    if (RNDebugLibs.installDoraemonKit) {
      RNDebugLibs.installDoraemonKit(productId);
    }
  },

  showDoraemonKit(): void {
    if (RNDebugLibs.showDoraemonKit) {
      RNDebugLibs.showDoraemonKit();
    }
  },

  hideDoraemonKit(): void {
    if (RNDebugLibs.hideDoraemonKit) {
      RNDebugLibs.hideDoraemonKit();
    }
  },
};
