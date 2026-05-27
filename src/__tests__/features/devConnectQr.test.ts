import { parseMetroQrPayload } from '../../features/devConnect/devConnectUtils';

describe('DevConnect QR payload parsing', () => {
  it('accepts Expo-style Metro URLs', () => {
    expect(parseMetroQrPayload('exp://192.168.31.8:8081')).toEqual({
      computerHost: '192.168.31.8',
      source: 'exp://192.168.31.8:8081',
    });
  });

  it('accepts HTTP Metro URLs', () => {
    expect(parseMetroQrPayload('http://192.168.31.8:8081/index.bundle?platform=ios')).toEqual({
      computerHost: '192.168.31.8',
      source: 'http://192.168.31.8:8081/index.bundle?platform=ios',
    });
  });
});
