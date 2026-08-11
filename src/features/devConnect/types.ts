export interface DevConnectState {
  isSimulator: boolean;
  computerHost: string;
  daemonPort: string;
  subnetPrefix?: string;
  streaming: boolean;
}

/** Shared Hub configuration supplied through DebugView.features.devConnect. */
export interface DevConnectV4Config {
  /** Stable organization-wide product identifier. */
  appId: string;
  /** Shared Hub HTTP origin, for example http://10.20.4.10:3799. */
  endpoint: string;
}

export interface DevConnectV4State {
  appId: string;
  canonicalEndpoint: string;
}

export type DevConnectSettingsPatch = Partial<
  Pick<DevConnectState, 'computerHost' | 'daemonPort'>
>;

export interface DevConnectFeatureControls {
  updateSettings?: (patch: DevConnectSettingsPatch) => void;
}
