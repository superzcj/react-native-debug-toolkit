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

  it('managed clear keeps the active environment for global Clear All', async () => {
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

    expect(feature.getCurrentEnvironmentId()).toBe('qa');
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: true });
    expect(getUrlRewriter()?.('https://api.example.com/users')).toBe(
      'https://qa-api.example.com/users',
    );
  });

  it('managed switch returns a promise after persistence completes', async () => {
    const feature = createEnvironmentFeature({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });
    feature.setup();
    await flushAsync();

    const result = feature.switchEnvironment('qa');
    expect(typeof (result as unknown as Promise<void>).then).toBe('function');
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: false });
    await result;

    expect(await getPreference(KEYS.environmentId)).toBe('qa');
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: true });
  });

  it('managed restore default clears persisted environment through a dedicated API', async () => {
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

    const restore = (feature as unknown as {
      restoreDefaultEnvironment?: () => Promise<void>;
    }).restoreDefaultEnvironment;

    expect(typeof restore).toBe('function');
    await restore?.();

    expect(feature.getCurrentEnvironmentId()).toBeNull();
    expect(feature.getSnapshot()).toMatchObject({ restartRequired: true });
    expect(await getPreference(KEYS.environmentId)).toBeNull();
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

  it('managed clear does not forget the persisted choice', async () => {
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

    expect(feature.getCurrentEnvironmentId()).toBe('qa');
    expect(await getPreference(KEYS.environmentId)).toBe('qa');
  });
});
