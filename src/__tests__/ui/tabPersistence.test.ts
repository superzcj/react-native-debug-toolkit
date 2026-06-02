import { resolveStoredTabIndex } from '../../ui/panel/tabPersistence';
import type { AnyDebugFeature } from '../../types';

function feature(name: string): AnyDebugFeature {
  return {
    name,
    label: name,
    setup: jest.fn(),
    getSnapshot: () => null,
    cleanup: jest.fn(),
  };
}

describe('resolveStoredTabIndex', () => {
  const features = [feature('network'), feature('console'), feature('user')];

  it('restores tab by feature name', () => {
    expect(resolveStoredTabIndex(features, 'user')).toBe(2);
  });

  it('supports legacy numeric tab preference', () => {
    expect(resolveStoredTabIndex(features, '1')).toBe(1);
  });

  it('falls back to first tab when stored tab is missing', () => {
    expect(resolveStoredTabIndex(features, 'missing')).toBe(0);
    expect(resolveStoredTabIndex(features, null)).toBe(0);
    expect(resolveStoredTabIndex(features, '99')).toBe(0);
  });
});
