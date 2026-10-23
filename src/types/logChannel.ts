import type { NativeLogLevel } from './logs';

export interface LogChannelConfig {
  id: string;
  title: string;
  enabled?: boolean;
  maxLogs?: number;
  maxBytes?: number;
}
export interface LogChannelInput {
  message: string;
  summary?: string;
  detail?: boolean;
  attachments?: readonly { label: string; value: string }[];
  timestamp?: number;
  level?: NativeLogLevel;
  category?: string;
  source?: { id: string; sequence: number };
  data?: unknown;
}
export interface LogChannelEntry extends LogChannelInput {
  id: string;
  timestamp: number;
  receivedAt: number;
  channelTitle: string;
  truncated?: boolean;
  originalBytes?: number;
}
export type LogRecordResult =
  'recorded' | 'duplicate' | 'disabled' | 'not_ready' | 'invalid';
