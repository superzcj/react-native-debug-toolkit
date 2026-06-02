export const DEFAULT_DAEMON_PORT = '3799';

export interface ParsedComputerTarget {
  computerHost: string;
}

function isValidIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) {
    return false;
  }

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const value = Number(part);
    return value >= 0 && value <= 255 && String(value) === part;
  });
}

function toUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

function parseHostAndPort(raw: string): { host: string; port: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(toUrlInput(trimmed));
    return {
      host: parsed.hostname.trim(),
      port: parsed.port.trim(),
    };
  } catch {
    return null;
  }
}

export function normalizeComputerHost(raw: string): string | null {
  const parsed = parseHostAndPort(raw);
  if (!parsed) {
    return null;
  }

  return isValidIpv4(parsed.host) ? parsed.host : null;
}

export function normalizePort(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return null;
  }
  return String(value);
}

export function parseComputerTarget(raw: string): ParsedComputerTarget | null {
  const parsed = parseHostAndPort(raw);
  if (!parsed || !isValidIpv4(parsed.host)) {
    return null;
  }

  return { computerHost: parsed.host };
}

export function buildDaemonDeviceHost(computerHost: string, daemonPort: string): string {
  const host = normalizeComputerHost(computerHost);
  if (!host) {
    return '';
  }

  const port = normalizePort(daemonPort) ?? DEFAULT_DAEMON_PORT;
  return port === DEFAULT_DAEMON_PORT ? host : `${host}:${port}`;
}

export function extractSubnetPrefix(ip: string): string | null {
  if (!isValidIpv4(ip)) {
    return null;
  }
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}
