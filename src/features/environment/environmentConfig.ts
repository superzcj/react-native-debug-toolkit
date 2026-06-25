import type {
  DebugEnvironment,
  DebugEnvironmentConfig,
  DebugEnvironmentInput,
  EnvironmentConfig,
  EnvironmentListItem,
  EnvironmentMode,
} from '../../types';

export interface NormalizedEnvironmentConfig {
  mode: EnvironmentMode;
  items: EnvironmentListItem[];
  defaultId: string | null;
  onChange?: (environment: DebugEnvironment) => void | Promise<void>;
}

export function isManagedEnvironmentConfig(
  input: DebugEnvironmentInput | undefined,
): input is DebugEnvironmentConfig {
  return (
    !!input &&
    !Array.isArray(input) &&
    Array.isArray(input.items) &&
    typeof input.defaultId === 'string'
  );
}

function normalizeLegacyItems(items: EnvironmentConfig[]): EnvironmentListItem[] {
  return items.map((item) => ({
    ...item,
    mode: 'legacy',
  }));
}

function normalizeManagedItems(items: DebugEnvironment[]): EnvironmentListItem[] {
  return items.map((item) => ({
    ...item,
    urls: { ...item.urls },
    mode: 'managed',
  }));
}

function resolveManagedDefaultId(
  requestedDefaultId: string,
  items: EnvironmentListItem[],
): string | null {
  if (items.some((item) => item.id === requestedDefaultId)) {
    return requestedDefaultId;
  }
  return items[0]?.id ?? null;
}

export function normalizeEnvironmentInput(
  input: DebugEnvironmentInput | undefined,
): NormalizedEnvironmentConfig {
  if (!input) {
    return {
      mode: 'legacy',
      items: [],
      defaultId: null,
    };
  }

  if (isManagedEnvironmentConfig(input)) {
    const items = normalizeManagedItems(input.items);
    return {
      mode: 'managed',
      items,
      defaultId: resolveManagedDefaultId(input.defaultId, items),
      onChange: input.onChange,
    };
  }

  return {
    mode: 'legacy',
    items: normalizeLegacyItems(input),
    defaultId: null,
  };
}

export function getInitialEnvironmentId(
  config: NormalizedEnvironmentConfig,
  persistedId: string | null,
): string | null {
  if (persistedId && config.items.some((item) => item.id === persistedId)) {
    return persistedId;
  }

  if (config.mode === 'managed') {
    return config.defaultId;
  }

  return null;
}

export function findManagedEnvironment(
  config: NormalizedEnvironmentConfig,
  environmentId: string | null,
): DebugEnvironment | null {
  if (config.mode !== 'managed' || !environmentId) {
    return null;
  }

  const found = config.items.find((item) => item.id === environmentId);
  if (!found || found.mode !== 'managed') {
    return null;
  }

  return {
    id: found.id,
    label: found.label,
    color: found.color,
    urls: { ...found.urls },
  };
}
