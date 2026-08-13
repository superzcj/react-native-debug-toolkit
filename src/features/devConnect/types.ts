/** Shared Hub configuration supplied through DebugView.features.devConnect. */
export interface DevConnectV4Config {
  /** Stable organization-wide product identifier. */
  appId: string;
  /**
   * Default Hub HTTP origin from the host App.
   * Optional in Debug builds (auto-discovery can find the local Hub).
   * Required for Release/internal builds that explicitly enable Toolkit.
   */
  endpoint?: string;
}

export interface DevConnectV4State {
  appId: string;
  canonicalEndpoint: string;
}
