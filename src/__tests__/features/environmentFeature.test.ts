// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { createEnvironmentFeature } from '../../features/environment';
import { getUrlRewriter, setUrlRewriter } from '../../utils/urlRewriter';
import { KEYS, getPreference, removePreference, setPreference } from '../../utils/debugPreferences';

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Environment feature', () => {
  beforeEach(async () => {
    await removePreference(KEYS.environmentId);
  });

  afterEach(async () => {
    await removePreference(KEYS.environmentId);
    setUrlRewriter(null);
  });

  it('managed config starts unselected without a persisted choice', async () => {
    const onChange = jest.fn();
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
      onChange,
    });

    feature.setup();
    await flushAsync();

    expect(feature.getSnapshot()).toMatchObject({
      currentEnvironmentId: null,
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      restartRequired: false,
    });
    expect(getUrlRewriter()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('managed config restores persisted id and installs prefix rewriter', async () => {
    await setPreference(KEYS.environmentId, 'qa');
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        {
          id: 'prod',
          label: 'Production',
          urls: {
            app: 'https://api.example.com',
            shop: 'https://api.example.com/shop',
          },
        },
        {
          id: 'qa',
          label: 'QA',
          urls: {
            app: 'https://qa-api.example.com',
            shop: 'https://qa-api.example.com/shop',
          },
        },
      ],
    });

    feature.setup();
    await flushAsync();

    expect(feature.getCurrentEnvironmentId()).toBe('qa');
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: false });
    expect(getUrlRewriter()?.('https://api.example.com/shop/products')).toBe(
      'https://qa-api.example.com/shop/products',
    );
  });

  it('managed switch persists id and calls onChange', async () => {
    const onChange = jest.fn();
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
      onChange,
    });
    feature.setup();
    await flushAsync();
    onChange.mockClear();

    feature.switchEnvironment('qa');
    await flushAsync();

    expect(feature.getCurrentEnvironmentId()).toBe('qa');
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: true });
    expect(onChange).toHaveBeenCalledWith({
      id: 'qa',
      label: 'QA',
      color: undefined,
      urls: { app: 'https://qa-api.example.com' },
    });
  });

  it('managed clear removes the active environment', async () => {
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });
    feature.setup();
    await flushAsync();

    feature.switchEnvironment('qa');
    await flushAsync();
    feature.clear?.();
    await flushAsync();

    expect(feature.getCurrentEnvironmentId()).toBeNull();
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: true });
    expect(getUrlRewriter()).toBeNull();
  });

  it('legacy config keeps nullable environment and host rewrite behavior', async () => {
    const feature = createEnvironmentFeature([
      { id: 'dev', label: 'Development', host: 'dev.api.example.com' },
      { id: 'prod', label: 'Production', host: 'api.example.com' },
    ]);

    feature.setup();
    await flushAsync();
    expect(feature.getCurrentEnvironmentId()).toBeNull();

    feature.switchEnvironment('dev');
    await flushAsync();

    expect(feature.getCurrentEnvironmentId()).toBe('dev');
    expect(getUrlRewriter()?.('https://api.example.com/users')).toBe(
      'https://dev.api.example.com/users',
    );

    feature.clear?.();
    await flushAsync();
    expect(feature.getCurrentEnvironmentId()).toBeNull();
  });

  it('managed cold-start does not let stale persisted load revert a synchronous switch', async () => {
    await setPreference(KEYS.environmentId, 'qa');
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });

    feature.setup();
    // Synchronously switch BEFORE the cold-start load's await resolves.
    feature.switchEnvironment('prod');
    await flushAsync();

    expect(feature.getCurrentEnvironmentId()).toBe('prod');
  });

  it('managed clear forgets the persisted choice and returns to no selection', async () => {
    await setPreference(KEYS.environmentId, 'qa');
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });

    feature.setup();
    await flushAsync();
    expect(feature.getCurrentEnvironmentId()).toBe('qa');

    feature.clear?.();
    await flushAsync();

    expect(feature.getCurrentEnvironmentId()).toBeNull();
    expect(await getPreference(KEYS.environmentId)).toBeNull();
  });
});
