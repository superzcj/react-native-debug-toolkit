import type { DaemonConnectionMode } from '../../utils/DaemonClient';

export interface DevConnectState {
  computerHost: string;
  mode: DaemonConnectionMode;
  qrAvailable: boolean;
  streaming: boolean;
}
