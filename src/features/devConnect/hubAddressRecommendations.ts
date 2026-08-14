import { normalizeHubEndpoint } from '../../utils/HubClient';

export type HubAddressRecommendation =
  | { kind: 'subnet'; value: string }
  | { kind: 'configured'; value: string };

export type HubAddressSubmission =
  | { kind: 'clear'; fallbackEndpoint: string }
  | { kind: 'incomplete' }
  | { kind: 'invalid' }
  | { kind: 'save'; endpoint: string };

function isValidIpv4Segment(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return parsed >= 0 && parsed <= 255 && String(parsed) === value;
}

export function extractIpv4SubnetPrefix(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || !parts.every(isValidIpv4Segment)) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}

export function hubEndpointHost(endpoint: string): string {
  const normalized = normalizeHubEndpoint(endpoint);
  if (normalized) {
    try {
      return new URL(normalized).hostname;
    } catch {
      // Fall through and strip a raw value.
    }
  }
  const trimmed = endpoint.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const withoutPort = trimmed.match(/^(.+):\d+$/);
  return withoutPort?.[1] ?? trimmed;
}

export function splitLanHost(
  host: string,
  subnetPrefix: string | null,
): { prefix: string | null; octet: string } {
  if (!subnetPrefix) {
    return { prefix: null, octet: host };
  }
  if (!host || host === subnetPrefix || host === subnetPrefix.slice(0, -1)) {
    return { prefix: subnetPrefix, octet: '' };
  }
  if (host.startsWith(subnetPrefix)) {
    const octet = host.slice(subnetPrefix.length);
    if (octet === '' || /^\d{1,3}$/.test(octet)) {
      return { prefix: subnetPrefix, octet };
    }
  }
  return { prefix: null, octet: host };
}

export const DEFAULT_HUB_PORT = '3800';

export type HubAddressFields = {
  prefix: string;
  octet: string;
  port: string;
};

export function hubEndpointPort(value: string): string {
  const normalized = normalizeHubEndpoint(value);
  if (normalized) {
    try {
      return new URL(normalized).port || DEFAULT_HUB_PORT;
    } catch {
      // Fall through and parse a raw value.
    }
  }
  const match = value.trim().match(/:(\d+)$/);
  return match?.[1] ?? DEFAULT_HUB_PORT;
}

function stripTrailingDot(value: string): string {
  return value.endsWith('.') ? value.slice(0, -1) : value;
}

export function splitHubAddressFields(
  value: string,
  fallbackPrefix: string | null,
): HubAddressFields {
  const host = hubEndpointHost(value);
  const port = hubEndpointPort(value);
  const parts = stripTrailingDot(host).split('.');
  if (parts.length === 4 && parts.every((part) => part === '' || /^\d{1,3}$/.test(part))) {
    const [first = '', second = '', third = '', fourth = ''] = parts;
    return {
      prefix: `${first}.${second}.${third}`,
      octet: fourth,
      port,
    };
  }
  if (parts.length === 3 && parts.every(isValidIpv4Segment)) {
    return { prefix: parts.join('.'), octet: '', port };
  }
  if (!host) {
    return {
      prefix: fallbackPrefix ? stripTrailingDot(fallbackPrefix) : '',
      octet: '',
      port: DEFAULT_HUB_PORT,
    };
  }
  return { prefix: host, octet: '', port };
}

export function composeHubAddressInput(fields: HubAddressFields): string {
  const prefix = stripTrailingDot(fields.prefix.trim());
  const octet = fields.octet.trim();
  const port = fields.port.trim() || DEFAULT_HUB_PORT;
  if (!prefix && !octet) {
    return '';
  }
  if (!octet) {
    return prefix;
  }
  return `${prefix}.${octet}:${port}`;
}

function isIncompleteIpv4Prefix(value: string): boolean {
  const trimmed = value.endsWith('.') ? value.slice(0, -1) : value;
  const parts = trimmed.split('.');
  return parts.length === 3 && parts.every(isValidIpv4Segment);
}

export function buildHubAddressRecommendations(input: {
  subnetPrefix: string | null;
  configuredEndpoint: string;
}): readonly HubAddressRecommendation[] {
  return [
    ...(input.subnetPrefix
      ? [{ kind: 'subnet' as const, value: input.subnetPrefix }]
      : []),
    ...(input.configuredEndpoint
      ? [{ kind: 'configured' as const, value: input.configuredEndpoint }]
      : []),
  ];
}

export function resolveHubAddressSubmission(
  input: string,
  configuredEndpoint: string,
  subnetPrefix?: string | null,
): HubAddressSubmission {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: 'clear', fallbackEndpoint: configuredEndpoint };
  }
  if (subnetPrefix && isValidIpv4Segment(trimmed)) {
    const endpoint = normalizeHubEndpoint(`${subnetPrefix}${trimmed}`);
    return endpoint ? { kind: 'save', endpoint } : { kind: 'invalid' };
  }
  if (isIncompleteIpv4Prefix(trimmed)) {
    return { kind: 'incomplete' };
  }
  const endpoint = normalizeHubEndpoint(trimmed);
  return endpoint ? { kind: 'save', endpoint } : { kind: 'invalid' };
}
