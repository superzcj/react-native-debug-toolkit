export interface EnvironmentConfig {
  id: string;
  label: string;
  host: string;
  color?: string;
}

export interface EnvironmentState {
  environments: EnvironmentConfig[];
  currentEnvironmentId: string | null;
}
