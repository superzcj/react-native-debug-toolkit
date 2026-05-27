import {
  buildMetroUrls,
  normalizeComputerHost,
  parseMetroQrPayload,
} from '../../features/devConnect/devConnectUtils';

describe('devConnectUtils', () => {
  it('normalizes plain IP, IP with port, and Metro URLs to a host only', () => {
    expect(normalizeComputerHost('192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeComputerHost('192.168.1.10:8081')).toBe('192.168.1.10');
    expect(normalizeComputerHost('exp://192.168.1.10:8081')).toBe('192.168.1.10');
    expect(normalizeComputerHost('http://192.168.1.10:8081/index.bundle?platform=ios')).toBe('192.168.1.10');
  });

  it('rejects invalid hosts instead of storing unsafe values', () => {
    expect(normalizeComputerHost('')).toBeNull();
    expect(normalizeComputerHost('999.1.1.1')).toBeNull();
    expect(normalizeComputerHost('localhost:8081')).toBeNull();
    expect(normalizeComputerHost('not an url')).toBeNull();
  });

  it('builds Metro URLs on port 8081 without changing daemon port', () => {
    expect(buildMetroUrls('192.168.1.10')).toEqual({
      expUrl: 'exp://192.168.1.10:8081',
      httpUrl: 'http://192.168.1.10:8081',
    });
    expect(buildMetroUrls('bad host')).toBeNull();
  });

  it('parses QR payloads with the same normalization rules', () => {
    expect(parseMetroQrPayload('exp://192.168.1.10:8081')).toEqual({
      computerHost: '192.168.1.10',
      source: 'exp://192.168.1.10:8081',
    });
    expect(parseMetroQrPayload('bad')).toBeNull();
  });
});
