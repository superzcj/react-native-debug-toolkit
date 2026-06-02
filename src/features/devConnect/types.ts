export interface DevConnectState {
  isSimulator: boolean;
  computerHost: string;
  daemonPort: string;
  subnetPrefix?: string;
  streaming: boolean;
}

export type DevConnectSettingsPatch = Partial<
  Pick<DevConnectState, 'computerHost' | 'daemonPort'>
>;

export interface DevConnectFeatureControls {
  updateSettings?: (patch: DevConnectSettingsPatch) => void;
}
