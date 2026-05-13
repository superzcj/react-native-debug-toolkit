import { Platform } from 'react-native';

import { DebugToolkit } from '../core/DebugToolkit';
import { safeStringify } from './safeStringify';

const DEFAULT_MAX_PER_TYPE = 50;
const DEFAULT_MAX_BODY_BYTES = 16 * 1024;
const MAX_DEPTH = 8;

export interface DebugSessionReportOptions {
  maxPerType?: number;
  maxBodyBytes?: number;
  includeTypes?: string[];
}

export interface DeviceInfo {
  platform: string;
  model: string;
  osVersion: string;
  appVersion: string;
}

export interface DebugSessionReport {
  version: 2;
  device: DeviceInfo;
  logs: Record<string, unknown[] | undefined>;
}

interface TruncatedValue {
  __debugToolkitTruncated: true;
  originalBytes: number;
  preview: string;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (utf8ByteLength(value) <= maxBytes) {
    return value;
  }

  let bytes = 0;
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const char = value[index]!;
    const charBytes = code <= 0x7f
      ? 1
      : code <= 0x7ff
        ? 2
        : code >= 0xd800 && code <= 0xdbff
          ? 4
          : 3;

    if (bytes + charBytes > maxBytes) {
      break;
    }

    result += char;
    bytes += charBytes;

    if (charBytes === 4) {
      index += 1;
      result += value[index] ?? '';
    }
  }

  return `${result}...[truncated]`;
}

function truncateLargeValue(value: unknown, maxBytes: number): unknown | TruncatedValue {
  const serialized = safeStringify(value);
  const originalBytes = utf8ByteLength(serialized);
  if (originalBytes <= maxBytes) {
    return value;
  }

  return {
    __debugToolkitTruncated: true,
    originalBytes,
    preview: truncateUtf8(serialized, maxBytes),
  };
}

function sanitizeValue(
  value: unknown,
  maxBodyBytes: number,
  depth = 0,
  seen = new WeakSet<object>(),
  key = '',
): unknown {
  if (typeof value === 'string') {
    return truncateUtf8(value, maxBodyBytes);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }

  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    return value;
  }

  const normalizedKey = key.toLowerCase();
  if (normalizedKey === 'body' || normalizedKey === 'data') {
    const normalized = sanitizeValue(value, maxBodyBytes, depth + 1, seen);
    return truncateLargeValue(normalized, maxBodyBytes);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, maxBodyBytes, depth + 1, seen));
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
    (acc, [entryKey, entryValue]) => {
      acc[entryKey] = sanitizeValue(entryValue, maxBodyBytes, depth + 1, seen, entryKey);
      return acc;
    },
    {},
  );
}

export function createDebugSessionReport(
  options: DebugSessionReportOptions = {},
): DebugSessionReport {
  const maxPerType = Math.max(1, Math.floor(options.maxPerType ?? DEFAULT_MAX_PER_TYPE));
  const maxBodyBytes = Math.max(256, Math.floor(options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES));
  const includeTypes = options.includeTypes?.length ? new Set(options.includeTypes) : null;
  const logs: DebugSessionReport['logs'] = {};

  DebugToolkit.features.forEach((feature) => {
    if (includeTypes && !includeTypes.has(feature.name)) {
      return;
    }

    let snapshot: unknown;
    try {
      snapshot = feature.getSnapshot();
    } catch {
      return;
    }

    if (!Array.isArray(snapshot)) {
      return;
    }

    logs[feature.name] = snapshot
      .slice(-maxPerType)
      .map((entry) => sanitizeValue(entry, maxBodyBytes));
  });

  const constants = Platform.constants as Record<string, unknown> | undefined;

  return {
    version: 2,
    device: {
      platform: Platform.OS,
      model: (constants?.model as string) || 'unknown',
      osVersion: Platform.Version == null ? 'unknown' : String(Platform.Version),
      appVersion: (constants?.appVersion as string) || 'unknown',
    },
    logs,
  };
}
