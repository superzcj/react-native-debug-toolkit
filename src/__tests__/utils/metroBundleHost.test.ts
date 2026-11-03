import { getMetroBundleHost } from '../../utils/metroBundleHost';
import { NativeModules } from 'react-native';

describe('metroBundleHost adapter', () => {
  afterEach(() => { delete NativeModules.SourceCode; });

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

  it('reads the Metro host from RN 0.88 SourceCode constants', () => {
    NativeModules.SourceCode = { getConstants: () => ({ scriptURL: 'http://192.168.1.8:8081/index.bundle' }) };
    expect(getMetroBundleHost()).toBe('192.168.1.8');
  });
});
