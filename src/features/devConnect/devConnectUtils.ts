export const DEFAULT_METRO_PORT = '8081';
export const DEFAULT_DAEMON_PORT = '3799';

export interface MetroUrls {
  expUrl: string;
  httpUrl: string;
}

export interface MetroTarget {
  host: string;
  port: string;
  hostPort: string;
  statusUrl: string;
}

export interface ParsedComputerTarget {
  computerHost: string;
  metroPort: string;
}

export interface ParsedMetroQrPayload {
  computerHost: string;
  metroPort: string;
  source: string;
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

  const metroPort = parsed.port
    ? normalizePort(parsed.port)
    : DEFAULT_METRO_PORT;
  if (!metroPort) {
    return null;
  }

  return {
    computerHost: parsed.host,
    metroPort,
  };
}

function normalizeMetroHost(rawHost: string): string | null {
  const parsed = parseHostAndPort(rawHost);
  if (!parsed) {
    return null;
  }
  if (parsed.host === 'localhost') {
    return parsed.host;
  }
  return isValidIpv4(parsed.host) ? parsed.host : null;
}

export function buildMetroTarget(rawHost: string, rawPort = DEFAULT_METRO_PORT): MetroTarget | null {
  const host = normalizeMetroHost(rawHost);
  if (!host) {
    return null;
  }

  const port = normalizePort(rawPort);
  if (!port) {
    return null;
  }

  return {
    host,
    port,
    hostPort: `${host}:${port}`,
    statusUrl: `http://${host}:${port}/status`,
  };
}

export function buildMetroUrls(rawHost: string, rawPort = DEFAULT_METRO_PORT): MetroUrls | null {
  const target = buildMetroTarget(rawHost, rawPort);
  if (!target) {
    return null;
  }

  return {
    expUrl: `exp://${target.hostPort}`,
    httpUrl: `http://${target.hostPort}`,
  };
}

export function parseMetroQrPayload(payload: string): ParsedMetroQrPayload | null {
  const target = parseComputerTarget(payload);
  if (!target) {
    return null;
  }
  return { ...target, source: payload };
}

export function buildDaemonDeviceHost(computerHost: string, daemonPort: string): string {
  const host = normalizeComputerHost(computerHost);
  if (!host) {
    return '';
  }

  const port = normalizePort(daemonPort) ?? DEFAULT_DAEMON_PORT;
  return port === DEFAULT_DAEMON_PORT ? host : `${host}:${port}`;
}
