const METRO_PORT = '8081';

export interface MetroUrls {
  expUrl: string;
  httpUrl: string;
}

export interface ParsedMetroQrPayload {
  computerHost: string;
  source: string;
}

function isValidIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
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

export function normalizeComputerHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(toUrlInput(trimmed));
    const host = parsed.hostname.trim();
    return isValidIpv4(host) ? host : null;
  } catch {
    return null;
  }
}

export function buildMetroUrls(rawHost: string): MetroUrls | null {
  const host = normalizeComputerHost(rawHost);
  if (!host) return null;

  return {
    expUrl: `exp://${host}:${METRO_PORT}`,
    httpUrl: `http://${host}:${METRO_PORT}`,
  };
}

export function parseMetroQrPayload(payload: string): ParsedMetroQrPayload | null {
  const computerHost = normalizeComputerHost(payload);
  if (!computerHost) return null;
  return { computerHost, source: payload };
}
