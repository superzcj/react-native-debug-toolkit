export interface DevConnectState {
  isSimulator: boolean;
  computerHost: string;
  metroPort: string;
  daemonPort: string;
  qrAvailable: boolean;
  nativeMetroAvailable: boolean;
  streaming: boolean;
}
