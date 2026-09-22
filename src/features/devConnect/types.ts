import type { HubClient } from '../../utils/HubClient';

/** Unified Connect object configuration. */
export interface DevConnectV4Config {
  /** Stable organization-wide product identifier. */
  appId?: string;
  /**
   * Default Hub HTTP origin from the host App.
   * Optional in Debug builds (auto-discovery can find the local Hub).
   * Release builds require a configured or manually entered address to upload.
   */
  endpoint?: string;
}

export interface DevConnectV4State {
  appId: string | null;
  canonicalEndpoint: string;
  configuredEndpoint: string;
  subnetPrefix: string | null;
  reason?: string;
  client: HubClient;
  resolveEndpoint?: () => Promise<string | null>;
  isCurrent?: () => boolean;
}
