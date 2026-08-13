import { getMetroBundleHost } from '../../utils/metroBundleHost';

describe('metroBundleHost adapter', () => {
  it('extracts the host from a React Native scriptURL', () => {
    expect(getMetroBundleHost({
      getScriptURL: () => 'http://172.31.23.67:8081/index.bundle?platform=ios&dev=true',
    })).toBe('172.31.23.67');
  });

  it('returns null when scriptURL is missing or unusable', () => {
    expect(getMetroBundleHost({ getScriptURL: () => null })).toBeNull();
    expect(getMetroBundleHost({ getScriptURL: () => 'file:///app/main.jsbundle' })).toBeNull();
    expect(getMetroBundleHost({ getScriptURL: () => 'not-a-url' })).toBeNull();
  });
});
