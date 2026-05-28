export interface DevConnectState {
  isSimulator: boolean;
  computerHost: string;
  metroPort: string;
  daemonPort: string;
  subnetPrefix?: string;
  nativeMetroAvailable: boolean;
  streaming: boolean;
}

export type DevConnectSettingsPatch = Partial<
  Pick<DevConnectState, 'computerHost' | 'metroPort' | 'daemonPort'>
>;

export interface DevConnectFeatureControls {
  updateSettings?: (patch: DevConnectSettingsPatch) => void;
}
