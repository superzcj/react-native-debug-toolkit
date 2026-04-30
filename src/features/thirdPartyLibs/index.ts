import { Platform } from 'react-native';
import { ThirdPartyLibsTab } from './ThirdPartyLibsTab';
import { NativeDebugLibs } from './nativeDebugLibs';
import type { DebugFeature, ThirdPartyLib } from '../../types';

const availableLibs: ThirdPartyLib[] = [
  {
    id: 'flex',
    name: 'FLEX',
    description: 'In-app debugging and exploration tool for iOS',
    platform: 'ios',
    actions: [
      { id: 'showExplorer', label: 'Show Explorer', onPress: NativeDebugLibs.showExplorer },
      { id: 'hideExplorer', label: 'Hide Explorer', onPress: NativeDebugLibs.hideExplorer },
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

function getPlatformLibs(): ThirdPartyLib[] {
  return availableLibs.filter(
    (lib) => lib.platform === 'both' || lib.platform === Platform.OS,
  );
}

export const createThirdPartyLibsFeature = (): DebugFeature<ThirdPartyLib[]> => ({
  name: 'thirdPartyLibs',
  label: 'Debug Libraries',
  renderContent: ThirdPartyLibsTab,
  setup: () => {},
  getSnapshot: () => getPlatformLibs(),
  cleanup: () => {},
});
