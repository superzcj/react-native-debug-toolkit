export interface DebugEnvironment {
  id: string;
  title: string;
  urls: Readonly<Record<string, string>>;
}

export interface EnvironmentOptions {
  enabled?: boolean;
  items?: readonly DebugEnvironment[];
  defaultId?: string;
  onChange?(environment: DebugEnvironment): void | Promise<void>;
}

export interface EnvironmentState {
  environments: readonly DebugEnvironment[];
  currentEnvironmentId: string | null;
  defaultEnvironmentId: string | null;
  busy: boolean;
  error: string | null;
}
