import { shortLabelForFeature } from '../../ui/panel/FeatureRail';

describe('shortLabelForFeature', () => {
  it('maps known feature ids', () => {
    expect(shortLabelForFeature('Network', 'network')).toBe('Net');
    expect(shortLabelForFeature('Console', 'console')).toBe('Log');
    expect(shortLabelForFeature('Navigation', 'navigation')).toBe('Nav');
    expect(shortLabelForFeature('Zustand', 'zustand')).toBe('State');
    expect(shortLabelForFeature('DevConnect', 'devConnect')).toBe('Dev');
    expect(shortLabelForFeature('Native', 'native')).toBe('Native');
    expect(shortLabelForFeature('Track', 'track')).toBe('Track');
    expect(shortLabelForFeature('Clipboard', 'clipboard')).toBe('Clip');
    expect(shortLabelForFeature('Environment', 'environment')).toBe('Env');
    expect(shortLabelForFeature('Session', 'sessionHistory')).toBe('Session');
    expect(shortLabelForFeature('Third Party', 'thirdPartyLibs')).toBe('Libs');
  });

  it('trims unknown label to 5 lowercase chars', () => {
    expect(shortLabelForFeature('CustomFeature', 'custom')).toBe('custo');
    expect(shortLabelForFeature('AB', 'ab')).toBe('ab');
  });

  it('trims whitespace before slicing', () => {
    expect(shortLabelForFeature('  MyTab  ', 'x')).toBe('mytab');
  });
});
