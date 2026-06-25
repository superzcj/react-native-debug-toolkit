export interface EnvironmentConfig {
  id: string;
  label: string;
  host: string;
  color?: string;
}

export interface DebugEnvironment {
  id: string;
  label: string;
  color?: string;
  urls: Record<string, string>;
}

export interface DebugEnvironmentConfig {
  defaultId: string;
  items: DebugEnvironment[];
  onChange?: (environment: DebugEnvironment) => void | Promise<void>;
}

export type DebugEnvironmentInput =
  | EnvironmentConfig[]
  | DebugEnvironmentConfig;

export type EnvironmentMode = 'legacy' | 'managed';

export type EnvironmentListItem =
  | (EnvironmentConfig & { mode: 'legacy' })
  | (DebugEnvironment & { mode: 'managed' });

export interface EnvironmentState {
  environments: EnvironmentListItem[];
  currentEnvironmentId: string | null;
  mode: EnvironmentMode;
  defaultEnvironmentId: string | null;
  restartRequired: boolean;
}
