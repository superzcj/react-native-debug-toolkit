import { Platform } from 'react-native';
import { ThirdPartyLibsTab } from './ThirdPartyLibsTab';
import { NativeDebugLibs } from './nativeDebugLibs';
import type { DebugFeature, ThirdPartyLib } from '../../types';

const libDefs: Omit<ThirdPartyLib, 'available'>[] = [
  {
    id: 'flex',
    name: 'FLEX',
    description: 'In-app debugging and exploration tool for iOS',
    platform: 'ios',
    actions: [
      { id: 'showExplorer', label: 'Show Explorer', onPress: NativeDebugLibs.showExplorer },
      { id: 'hideExplorer', label: 'Hide Explorer', onPress: NativeDebugLibs.hideExplorer },
      { id: 'toggleExplorer', label: 'Toggle Explorer', onPress: NativeDebugLibs.toggleExplorer },
    ],
  },
  {
    id: 'doraemonkit',
    name: 'DoraemonKit',
    description: 'A full-featured iOS & Android development assistant',
    platform: 'both',
    actions: [
      { id: 'showDoraemonKit', label: 'Show DoraemonKit', onPress: NativeDebugLibs.showDoraemonKit },
      { id: 'hideDoraemonKit', label: 'Hide DoraemonKit', onPress: NativeDebugLibs.hideDoraemonKit },
    ],
  },
];

function isLibAvailable(id: string): boolean {
  if (id === 'flex') return NativeDebugLibs.isFLEXAvailable();
  if (id === 'doraemonkit') return NativeDebugLibs.isDoraemonKitAvailable();
  return false;
}

function getAvailableLibs(): ThirdPartyLib[] {
  return libDefs
    .filter((lib) => lib.platform === 'both' || lib.platform === Platform.OS)
    .filter((lib) => isLibAvailable(lib.id))
    .map((lib) => ({ ...lib, available: true }));
}

export const createThirdPartyLibsFeature = (): DebugFeature<ThirdPartyLib[]> => ({
  name: 'thirdPartyLibs',
  label: 'Debug Libraries',
  renderContent: ThirdPartyLibsTab,
  setup: () => {},
  getSnapshot: () => getAvailableLibs(),
  cleanup: () => {},
});
