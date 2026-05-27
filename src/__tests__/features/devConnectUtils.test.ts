import {
  DEFAULT_DAEMON_PORT,
  DEFAULT_METRO_PORT,
  buildMetroTarget,
  buildMetroUrls,
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
  parseMetroQrPayload,
} from '../../features/devConnect/devConnectUtils';

describe('devConnectUtils', () => {
  it('exposes default ports for Metro and desktop logs separately', () => {
    expect(DEFAULT_METRO_PORT).toBe('8081');
    expect(DEFAULT_DAEMON_PORT).toBe('3799');
  });

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

  it('normalizes valid ports and rejects invalid ports', () => {
    expect(normalizePort('8082')).toBe('8082');
    expect(normalizePort(' 8083 ')).toBe('8083');
    expect(normalizePort('0')).toBeNull();
    expect(normalizePort('65536')).toBeNull();
    expect(normalizePort('abc')).toBeNull();
  });

  it('parses computer target with Metro port from IP or URL input', () => {
    expect(parseComputerTarget('192.168.1.10')).toEqual({
      computerHost: '192.168.1.10',
      metroPort: '8081',
    });
    expect(parseComputerTarget('192.168.1.10:8082')).toEqual({
      computerHost: '192.168.1.10',
      metroPort: '8082',
    });
    expect(parseComputerTarget('exp://192.168.1.10:19000')).toEqual({
      computerHost: '192.168.1.10',
      metroPort: '19000',
    });
    expect(parseComputerTarget('999.1.1.1:8081')).toBeNull();
    expect(parseComputerTarget('192.168.1.10:99999')).toBeNull();
  });

  it('builds Metro URLs with stored Metro port without changing daemon port', () => {
    expect(buildMetroUrls('192.168.1.10')).toEqual({
      expUrl: 'exp://192.168.1.10:8081',
      httpUrl: 'http://192.168.1.10:8081',
    });
    expect(buildMetroUrls('192.168.1.10', '8082')).toEqual({
      expUrl: 'exp://192.168.1.10:8082',
      httpUrl: 'http://192.168.1.10:8082',
    });
    expect(buildMetroUrls('bad host')).toBeNull();
  });

  it('builds native Metro hostPort and status URL', () => {
    expect(buildMetroTarget('192.168.1.10', '8082')).toEqual({
      host: '192.168.1.10',
      port: '8082',
      hostPort: '192.168.1.10:8082',
      statusUrl: 'http://192.168.1.10:8082/status',
    });
    expect(buildMetroTarget('192.168.1.10', '99999')).toBeNull();
  });

  it('parses QR payloads with the same normalization rules', () => {
    expect(parseMetroQrPayload('exp://192.168.1.10:8081')).toEqual({
      computerHost: '192.168.1.10',
      metroPort: '8081',
      source: 'exp://192.168.1.10:8081',
    });
    expect(parseMetroQrPayload('http://192.168.1.10:8082/index.bundle?platform=ios')).toEqual({
      computerHost: '192.168.1.10',
      metroPort: '8082',
      source: 'http://192.168.1.10:8082/index.bundle?platform=ios',
    });
    expect(parseMetroQrPayload('bad')).toBeNull();
  });
});
