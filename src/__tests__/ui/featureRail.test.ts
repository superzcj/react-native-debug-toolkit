import { shortLabelForFeature } from '../../ui/panel/FeatureRail';

describe('shortLabelForFeature', () => {
  it('maps known feature ids', () => {
    expect(shortLabelForFeature('Network', 'network')).toBe('Net');
    expect(shortLabelForFeature('Console', 'console')).toBe('Logs');
    expect(shortLabelForFeature('Navigation', 'navigation')).toBe('Nav');
    expect(shortLabelForFeature('State', 'state')).toBe('State');
    expect(shortLabelForFeature('Connect', 'connect')).toBe('Connect');
    expect(shortLabelForFeature('Native', 'native')).toBe('Native');
    expect(shortLabelForFeature('Track', 'track')).toBe('Track');
    expect(shortLabelForFeature('Clipboard', 'clipboard')).toBe('Clip');
    expect(shortLabelForFeature('Environment', 'environment')).toBe('Env');
    expect(shortLabelForFeature('History', 'history')).toBe('History');
    expect(shortLabelForFeature('Custom', 'tabs')).toBe('Custom');
    expect(shortLabelForFeature('Accounts', 'accounts')).toBe('Accounts');
  });

  it('trims unknown label to readable tab label', () => {
    expect(shortLabelForFeature('CustomFeatureLongName', 'custom')).toBe('CustomFeatur');
    expect(shortLabelForFeature('AB', 'ab')).toBe('AB');
  });

  it('trims whitespace before slicing', () => {
    expect(shortLabelForFeature('  MyTab  ', 'x')).toBe('MyTab');
  });
});
