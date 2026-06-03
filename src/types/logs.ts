export interface NetworkLogEntry {
  id: string;
  timestamp: number;
  duration?: number;
  request: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  response?: {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    data?: unknown;
    success?: boolean;
  };
  error?: string;
}

export interface ConsoleLogEntry {
  id: string;
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error';
  data: unknown[];
}

export interface ZustandLogEntry {
  id: string;
  timestamp: number;
  action: string;
  prevState: unknown;
  nextState: unknown;
  actionCompleteTime?: number;
  storeName?: string;
}

export interface NavigationLogEntry {
  id: string;
  timestamp: number;
  action: string;
  from: string;
  to: string;
  startTime?: number;
  duration?: number;
  debugLog?: string;
}

export interface TrackLogEntry {
  id: string;
  timestamp: number;
  eventName: string;
  [key: string]: unknown;
}

export type NativeLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'unknown';
export type NativeLogSource = 'logcat' | 'rctLog' | 'manual';

export interface NativeLogEntry {
  id: string;
  timestamp: number;
  platform: 'android' | 'ios' | 'unknown';
  level: NativeLogLevel;
  source: NativeLogSource;
  message: string;
  tag?: string;
  thread?: string;
  file?: string;
  line?: number;
  raw?: string;
}
