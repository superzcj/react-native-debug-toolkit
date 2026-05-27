export interface DevConnectState {
  isSimulator: boolean;
  computerHost: string;
  metroPort: string;
  daemonPort: string;
  subnetPrefix?: string;
  nativeMetroAvailable: boolean;
  streaming: boolean;
}
