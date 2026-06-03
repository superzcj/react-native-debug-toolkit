import { shortLabelForFeature } from '../../ui/panel/FeatureRail';

describe('shortLabelForFeature', () => {
  it('maps known feature ids', () => {
    expect(shortLabelForFeature('Network', 'network')).toBe('network');
    expect(shortLabelForFeature('Console', 'console')).toBe('console');
    expect(shortLabelForFeature('Navigation', 'navigation')).toBe('nav');
    expect(shortLabelForFeature('Zustand', 'zustand')).toBe('zustand');
    expect(shortLabelForFeature('DevConnect', 'devConnect')).toBe('dev');
    expect(shortLabelForFeature('Native', 'native')).toBe('native');
    expect(shortLabelForFeature('Track', 'track')).toBe('track');
    expect(shortLabelForFeature('Clipboard', 'clipboard')).toBe('clip');
    expect(shortLabelForFeature('Environment', 'environment')).toBe('env');
    expect(shortLabelForFeature('Session', 'sessionHistory')).toBe('session');
    expect(shortLabelForFeature('Third Party', 'thirdPartyLibs')).toBe('libs');
  });

  it('trims unknown label to 7 lowercase chars', () => {
    expect(shortLabelForFeature('CustomFeature', 'custom')).toBe('customf');
    expect(shortLabelForFeature('AB', 'ab')).toBe('ab');
  });

  it('trims whitespace before slicing', () => {
    expect(shortLabelForFeature('  MyTab  ', 'x')).toBe('mytab');
  });
});
