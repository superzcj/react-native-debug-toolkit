export interface ThirdPartyLibAction {
  id: string;
  label: string;
  onPress: () => void;
}

export interface ThirdPartyLib {
  id: string;
  name: string;
  description: string;
  platform: 'ios' | 'android' | 'both';
  actions: ThirdPartyLibAction[];
}
