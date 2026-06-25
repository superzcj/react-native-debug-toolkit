import {
  normalizeEnvironmentInput,
  getInitialEnvironmentId,
  isManagedEnvironmentConfig,
  findManagedEnvironment,
} from '../../features/environment/environmentConfig';
import type { DebugEnvironmentConfig, EnvironmentConfig } from '../../types';

describe('environment config normalization', () => {
  it('normalizes legacy host array input', () => {
    const legacy: EnvironmentConfig[] = [
      { id: 'dev', label: 'Development', host: 'dev.api.example.com' },
      { id: 'prod', label: 'Production', host: 'api.example.com', color: '#f00' },
    ];

    const normalized = normalizeEnvironmentInput(legacy);

    expect(normalized.mode).toBe('legacy');
    expect(normalized.items).toEqual([
      { id: 'dev', label: 'Development', host: 'dev.api.example.com', mode: 'legacy' },
      { id: 'prod', label: 'Production', host: 'api.example.com', color: '#f00', mode: 'legacy' },
    ]);
    expect(normalized.defaultId).toBeNull();
    expect(normalized.onChange).toBeUndefined();
  });

  it('normalizes object-form managed input', () => {
    const onChange = jest.fn();
    const config: DebugEnvironmentConfig = {
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
          color: '#0f0',
          urls: {
            app: 'https://qa-api.example.com',
            shop: 'https://qa-api.example.com/shop',
          },
        },
      ],
      onChange,
    };

    const normalized = normalizeEnvironmentInput(config);

    expect(normalized.mode).toBe('managed');
    expect(normalized.defaultId).toBe('prod');
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0]).toMatchObject({
      id: 'prod',
      label: 'Production',
      urls: {
        app: 'https://api.example.com',
        shop: 'https://api.example.com/shop',
      },
    });
    expect(normalized.onChange).toBe(onChange);
  });

  it('falls back to first managed item when defaultId is missing', () => {
    const normalized = normalizeEnvironmentInput({
      defaultId: 'missing',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });

    expect(normalized.defaultId).toBe('prod');
  });

  it('uses persisted managed id only when it exists and otherwise stays unselected', () => {
    const normalized = normalizeEnvironmentInput({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });

    expect(getInitialEnvironmentId(normalized, 'qa')).toBe('qa');
    expect(getInitialEnvironmentId(normalized, 'deleted')).toBeNull();
    expect(getInitialEnvironmentId(normalized, null)).toBeNull();
  });

  it('uses persisted legacy id only when it exists', () => {
    const normalized = normalizeEnvironmentInput([
      { id: 'dev', label: 'Development', host: 'dev.api.example.com' },
      { id: 'prod', label: 'Production', host: 'api.example.com' },
    ]);

    expect(getInitialEnvironmentId(normalized, 'dev')).toBe('dev');
    expect(getInitialEnvironmentId(normalized, 'deleted')).toBeNull();
    expect(getInitialEnvironmentId(normalized, null)).toBeNull();
  });

  it('detects object-form config', () => {
    expect(isManagedEnvironmentConfig({ defaultId: 'prod', items: [] })).toBe(true);
    expect(isManagedEnvironmentConfig([{ id: 'prod', label: 'Production', host: 'api.example.com' }])).toBe(false);
    expect(isManagedEnvironmentConfig(undefined)).toBe(false);
  });

  describe('findManagedEnvironment', () => {
    const managed = normalizeEnvironmentInput({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });
    const legacy = normalizeEnvironmentInput([
      { id: 'dev', label: 'Development', host: 'dev.api.example.com' },
    ]);

    it('returns the matching managed environment with cloned urls', () => {
      const env = findManagedEnvironment(managed, 'qa');
      expect(env).toEqual({
        id: 'qa',
        label: 'QA',
        color: undefined,
        urls: { app: 'https://qa-api.example.com' },
      });
      const managedQa = managed.items[1];
      expect(env?.urls).not.toBe((managedQa as { urls: unknown }).urls);
    });

    it('returns null for an unknown managed id', () => {
      expect(findManagedEnvironment(managed, 'nope')).toBeNull();
    });

    it('returns null for a null environment id', () => {
      expect(findManagedEnvironment(managed, null)).toBeNull();
    });

    it('returns null for a legacy config', () => {
      expect(findManagedEnvironment(legacy, 'dev')).toBeNull();
    });
  });
});
