import {
  DEFAULT_DAEMON_PORT,
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
  buildDaemonDeviceHost,
} from '../../features/devConnect/devConnectUtils';

describe('devConnectUtils', () => {
  it('exposes default daemon port', () => {
    expect(DEFAULT_DAEMON_PORT).toBe('3799');
  });

  it('normalizes plain IP, IP with port, and URLs to a host only', () => {
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

  it('parses computer host from IP or URL input', () => {
    expect(parseComputerTarget('192.168.1.10')).toEqual({
      computerHost: '192.168.1.10',
    });
    expect(parseComputerTarget('192.168.1.10:8082')).toEqual({
      computerHost: '192.168.1.10',
    });
    expect(parseComputerTarget('exp://192.168.1.10:19000')).toEqual({
      computerHost: '192.168.1.10',
    });
    expect(parseComputerTarget('999.1.1.1:8081')).toBeNull();
  });

  it('builds daemon device host with optional port', () => {
    expect(buildDaemonDeviceHost('192.168.1.10', '3799')).toBe('192.168.1.10');
    expect(buildDaemonDeviceHost('192.168.1.10', '3800')).toBe('192.168.1.10:3800');
    expect(buildDaemonDeviceHost('', '3799')).toBe('');
  });
});
