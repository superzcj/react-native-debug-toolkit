# Environment Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small object-form environment switcher to `react-native-debug-toolkit` with persisted selection, URL prefix rewriting, and one host-app `onChange` callback.

**Architecture:** Keep the feature inside the existing `Environment` boundary. Add pure config and rewrite helpers, use them from `createEnvironmentFeature`, keep legacy host-based environments compatible, and let host apps handle app-specific runtime reset in `onChange`.

**Tech Stack:** TypeScript, React Native, Jest/ts-jest, existing DebugFeature API, existing XHR URL rewriter utility, existing debug preference storage.

---

## File Structure

- Create `src/features/environment/environmentConfig.ts`
  - Owns input normalization for legacy array form and new object form.
  - Exports pure helpers used by feature logic and tests.
- Create `src/features/environment/urlPrefixRewrite.ts`
  - Owns longest-prefix URL rewrite for object-form environments.
- Create `src/__tests__/features/environmentConfig.test.ts`
  - Covers default selection and legacy/object normalization.
- Create `src/__tests__/features/environmentRewrite.test.ts`
  - Covers prefix rewrite rules.
- Create `src/__tests__/features/environmentFeature.test.ts`
  - Covers feature setup, persistence, callback, legacy compatibility, and installed rewriter.
- Modify `src/types/environment.ts`
  - Adds object-form types while preserving the existing legacy `EnvironmentConfig`.
- Modify `src/types/index.ts`
  - Re-export new environment types.
- Modify `src/utils/debugPreferences.ts`
  - Add one storage key for active environment id.
- Modify `src/features/environment/index.ts`
  - Use normalized config, persist active id through debug preferences, install either legacy host rewriter or object-form prefix rewriter.
- Modify `src/features/environment/EnvironmentTab.tsx`
  - Show URL key summary for object-form environments, keep host display for legacy.
- Modify `src/ui/DebugView.tsx`
  - Accept `EnvironmentConfig[] | DebugEnvironmentConfig` in `environments`.
- Modify `README.md` and `README.zh-CN.md`
  - Document object-form environment switching and host-app callback responsibility.

---

### Task 1: Add Public Types And Config Normalizer

**Files:**
- Modify: `src/types/environment.ts`
- Modify: `src/types/index.ts`
- Create: `src/features/environment/environmentConfig.ts`
- Test: `src/__tests__/features/environmentConfig.test.ts`

- [ ] **Step 1: Write failing tests for config normalization**

Create `src/__tests__/features/environmentConfig.test.ts`:

```ts
import {
  normalizeEnvironmentInput,
  getInitialEnvironmentId,
  isManagedEnvironmentConfig,
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

  it('uses persisted managed id only when it exists', () => {
    const normalized = normalizeEnvironmentInput({
      defaultId: 'prod',
      items: [
        { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
      ],
    });

    expect(getInitialEnvironmentId(normalized, 'qa')).toBe('qa');
    expect(getInitialEnvironmentId(normalized, 'deleted')).toBe('prod');
    expect(getInitialEnvironmentId(normalized, null)).toBe('prod');
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/features/environmentConfig.test.ts --runInBand --watchman=false
```

Expected: FAIL with module not found for `environmentConfig`.

- [ ] **Step 3: Add environment public types**

Replace `src/types/environment.ts` with:

```ts
export interface EnvironmentConfig {
  id: string;
  label: string;
  host: string;
  color?: string;
}

export interface DebugEnvironment {
  id: string;
  label: string;
  color?: string;
  urls: Record<string, string>;
}

export interface DebugEnvironmentConfig {
  defaultId: string;
  items: DebugEnvironment[];
  onChange?: (environment: DebugEnvironment) => void | Promise<void>;
}

export type DebugEnvironmentInput =
  | EnvironmentConfig[]
  | DebugEnvironmentConfig;

export type EnvironmentMode = 'legacy' | 'managed';

export type EnvironmentListItem =
  | (EnvironmentConfig & { mode: 'legacy' })
  | (DebugEnvironment & { mode: 'managed' });

export interface EnvironmentState {
  environments: EnvironmentListItem[];
  currentEnvironmentId: string | null;
  mode: EnvironmentMode;
  defaultEnvironmentId: string | null;
}
```

Update `src/types/index.ts` environment export block:

```ts
export type {
  DebugEnvironment,
  DebugEnvironmentConfig,
  DebugEnvironmentInput,
  EnvironmentConfig,
  EnvironmentListItem,
  EnvironmentMode,
  EnvironmentState,
} from './environment';
```

- [ ] **Step 4: Add config normalizer**

Create `src/features/environment/environmentConfig.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- src/__tests__/features/environmentConfig.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 6: Commit task 1**

```bash
git add src/types/environment.ts src/types/index.ts src/features/environment/environmentConfig.ts src/__tests__/features/environmentConfig.test.ts
git commit -m "feat: add environment config model"
```

---

### Task 2: Add Longest-Prefix URL Rewrite Helper

**Files:**
- Create: `src/features/environment/urlPrefixRewrite.ts`
- Test: `src/__tests__/features/environmentRewrite.test.ts`

- [ ] **Step 1: Write failing rewrite tests**

Create `src/__tests__/features/environmentRewrite.test.ts`:

```ts
import {
  buildManagedUrlRewriter,
  rewriteByLongestPrefix,
} from '../../features/environment/urlPrefixRewrite';
import type { DebugEnvironment } from '../../types';

const prod: DebugEnvironment = {
  id: 'prod',
  label: 'Production',
  urls: {
    app: 'https://api.example.com',
    shop: 'https://api.example.com/shop',
    auth: 'https://auth.example.com',
  },
};

const qa: DebugEnvironment = {
  id: 'qa',
  label: 'QA',
  urls: {
    app: 'https://qa-api.example.com',
    shop: 'https://qa-api.example.com/shop',
    auth: 'https://qa-auth.example.com',
  },
};

describe('managed environment URL rewrite', () => {
  it('rewrites default app URL to selected app URL', () => {
    expect(
      rewriteByLongestPrefix(
        'https://api.example.com/users?active=1#top',
        prod.urls,
        qa.urls,
      ),
    ).toBe('https://qa-api.example.com/users?active=1#top');
  });

  it('uses longest prefix when services share host', () => {
    expect(
      rewriteByLongestPrefix(
        'https://api.example.com/shop/products?x=1',
        prod.urls,
        qa.urls,
      ),
    ).toBe('https://qa-api.example.com/shop/products?x=1');
  });

  it('does not match partial path segment', () => {
    expect(
      rewriteByLongestPrefix(
        'https://api.example.com/shopping/cart',
        { shop: 'https://api.example.com/shop' },
        { shop: 'https://qa-api.example.com/shop' },
      ),
    ).toBe('https://api.example.com/shopping/cart');
  });

  it('keeps URL unchanged when selected env lacks matching key', () => {
    expect(
      rewriteByLongestPrefix(
        'https://auth.example.com/login',
        { auth: 'https://auth.example.com' },
        { app: 'https://qa-api.example.com' },
      ),
    ).toBe('https://auth.example.com/login');
  });

  it('keeps invalid and relative URLs unchanged', () => {
    expect(rewriteByLongestPrefix('/relative/path', prod.urls, qa.urls)).toBe('/relative/path');
    expect(rewriteByLongestPrefix('not a url', prod.urls, qa.urls)).toBe('not a url');
  });

  it('does not rewrite when selected environment is default environment', () => {
    const rewriter = buildManagedUrlRewriter(prod, prod);
    expect(rewriter).toBeNull();
  });

  it('builds rewriter from two environments', () => {
    const rewriter = buildManagedUrlRewriter(prod, qa);
    expect(rewriter('https://auth.example.com/oauth/token')).toBe('https://qa-auth.example.com/oauth/token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/features/environmentRewrite.test.ts --runInBand --watchman=false
```

Expected: FAIL with module not found for `urlPrefixRewrite`.

- [ ] **Step 3: Add rewrite helper**

Create `src/features/environment/urlPrefixRewrite.ts`:

```ts
import type { DebugEnvironment } from '../../types';

type UrlMap = Record<string, string>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeAbsoluteUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

function matchesPrefixBoundary(url: string, prefix: string): boolean {
  if (url === prefix) {
    return true;
  }

  if (!url.startsWith(prefix)) {
    return false;
  }

  const next = url.charAt(prefix.length);
  return next === '/' || next === '?' || next === '#';
}

interface PrefixPair {
  key: string;
  source: string;
  target: string;
}

function buildPrefixPairs(sourceUrls: UrlMap, targetUrls: UrlMap): PrefixPair[] {
  return Object.keys(sourceUrls)
    .map((key) => {
      const source = normalizeAbsoluteUrl(sourceUrls[key]!);
      const targetRaw = targetUrls[key];
      const target = targetRaw ? normalizeAbsoluteUrl(targetRaw) : null;
      if (!source || !target) {
        return null;
      }
      return { key, source, target };
    })
    .filter((pair): pair is PrefixPair => pair != null)
    .sort((a, b) => b.source.length - a.source.length);
}

export function rewriteByLongestPrefix(
  url: string,
  sourceUrls: UrlMap,
  targetUrls: UrlMap,
): string {
  const normalizedUrl = normalizeAbsoluteUrl(url);
  if (!normalizedUrl) {
    return url;
  }

  const pair = buildPrefixPairs(sourceUrls, targetUrls).find((candidate) =>
    matchesPrefixBoundary(normalizedUrl, candidate.source),
  );

  if (!pair) {
    return url;
  }

  return `${pair.target}${normalizedUrl.slice(pair.source.length)}`;
}

export function buildManagedUrlRewriter(
  defaultEnvironment: DebugEnvironment | null,
  activeEnvironment: DebugEnvironment | null,
): ((url: string) => string) | null {
  if (!defaultEnvironment || !activeEnvironment) {
    return null;
  }

  if (defaultEnvironment.id === activeEnvironment.id) {
    return null;
  }

  return (url: string) =>
    rewriteByLongestPrefix(url, defaultEnvironment.urls, activeEnvironment.urls);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/__tests__/features/environmentRewrite.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 5: Commit task 2**

```bash
git add src/features/environment/urlPrefixRewrite.ts src/__tests__/features/environmentRewrite.test.ts
git commit -m "feat: add environment URL prefix rewrite"
```

---

### Task 3: Refactor Environment Feature State, Persistence, Callback, And Rewriter

**Files:**
- Modify: `src/utils/debugPreferences.ts`
- Modify: `src/features/environment/index.ts`
- Test: `src/__tests__/features/environmentFeature.test.ts`

- [ ] **Step 1: Write failing feature tests**

Create `src/__tests__/features/environmentFeature.test.ts`:

```ts
// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { createEnvironmentFeature } from '../../features/environment';
import { getUrlRewriter, setUrlRewriter } from '../../utils/urlRewriter';
import { KEYS, removePreference, setPreference } from '../../utils/debugPreferences';

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

  it('managed config starts from default environment and calls onChange', async () => {
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
      currentEnvironmentId: 'prod',
      mode: 'managed',
      defaultEnvironmentId: 'prod',
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      id: 'prod',
      label: 'Production',
      color: undefined,
      urls: { app: 'https://api.example.com' },
    });
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
    expect(onChange).toHaveBeenCalledWith({
      id: 'qa',
      label: 'QA',
      color: undefined,
      urls: { app: 'https://qa-api.example.com' },
    });
  });

  it('managed clear returns to default environment', async () => {
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

    expect(feature.getCurrentEnvironmentId()).toBe('prod');
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/__tests__/features/environmentFeature.test.ts --runInBand --watchman=false
```

Expected: FAIL because `KEYS.environmentId` and managed feature behavior do not exist.

- [ ] **Step 3: Add environment preference key**

In `src/utils/debugPreferences.ts`, update `KEYS`:

```ts
export const KEYS = {
  fabPosition: '@react_native_debug_toolkit/fab_position',
  lastTab: '@react_native_debug_toolkit/last_tab',
  computerHost: '@react_native_debug_toolkit/computer_host',
  daemonPort: '@react_native_debug_toolkit/daemon_port',
  environmentId: '@react_native_debug_toolkit/environment_id',
} as const;
```

- [ ] **Step 4: Replace environment feature implementation**

Replace `src/features/environment/index.ts` with:

```ts
import { EnvironmentTab } from './EnvironmentTab';
import {
  findManagedEnvironment,
  getInitialEnvironmentId,
  normalizeEnvironmentInput,
  type NormalizedEnvironmentConfig,
} from './environmentConfig';
import { buildManagedUrlRewriter } from './urlPrefixRewrite';
import type {
  DebugEnvironmentInput,
  DebugFeature,
  DebugFeatureListener,
  EnvironmentConfig,
  EnvironmentState,
} from '../../types';
import { KEYS, getPreference, setPreference, removePreference } from '../../utils/debugPreferences';
import { setUrlRewriter } from '../../utils/urlRewriter';

function buildLegacyHostsMap(
  environments: EnvironmentConfig[],
  targetId: string | null,
): Map<string, string> | null {
  if (!targetId) return null;
  const target = environments.find((e) => e.id === targetId);
  if (!target) return null;

  const map = new Map<string, string>();
  for (const env of environments) {
    if (env.id !== targetId) {
      map.set(env.host, target.host);
    }
  }
  return map;
}

function createLegacyUrlRewriter(hostsMap: Map<string, string> | null): ((url: string) => string) | null {
  if (!hostsMap) return null;
  return (url: string): string => {
    try {
      const parsed = new URL(url);
      const targetHost = hostsMap.get(parsed.host);
      if (targetHost) {
        return url.replace(parsed.host, targetHost);
      }
    } catch {
      return url;
    }
    return url;
  };
}

export interface EnvironmentFeatureAPI extends DebugFeature<EnvironmentState> {
  registerEnvironments: (environments: DebugEnvironmentInput) => void;
  switchEnvironment: (environmentId: string | null) => void;
  getCurrentEnvironmentId: () => string | null;
}

export const createEnvironmentFeature = (
  initialEnvironments?: DebugEnvironmentInput,
): EnvironmentFeatureAPI => {
  const listeners = new Set<DebugFeatureListener>();
  let config: NormalizedEnvironmentConfig = normalizeEnvironmentInput(initialEnvironments);
  let initialized = false;
  let activeEnvironmentId: string | null = config.mode === 'managed' ? config.defaultId : null;

  const getCurrentState = (): EnvironmentState => ({
    environments: config.items,
    currentEnvironmentId: activeEnvironmentId,
    mode: config.mode,
    defaultEnvironmentId: config.defaultId,
  });

  const notify = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const getLegacyItems = (): EnvironmentConfig[] =>
    config.items
      .filter((item): item is EnvironmentConfig & { mode: 'legacy' } => item.mode === 'legacy')
      .map(({ mode, ...item }) => item);

  const installRewriter = () => {
    if (!initialized) return;

    if (config.mode === 'managed') {
      const defaultEnv = findManagedEnvironment(config, config.defaultId);
      const activeEnv = findManagedEnvironment(config, activeEnvironmentId);
      setUrlRewriter(buildManagedUrlRewriter(defaultEnv, activeEnv));
      return;
    }

    setUrlRewriter(
      createLegacyUrlRewriter(buildLegacyHostsMap(getLegacyItems(), activeEnvironmentId)),
    );
  };

  const callManagedChange = () => {
    if (config.mode !== 'managed' || !config.onChange) {
      return;
    }

    const env = findManagedEnvironment(config, activeEnvironmentId);
    if (!env) {
      return;
    }

    Promise.resolve(config.onChange(env)).catch((err) => {
      if (__DEV__) {
        console.warn('[DebugToolkit] Environment onChange failed:', err);
      }
    });
  };

  const persistSelection = async (envId: string | null) => {
    if (envId) {
      await setPreference(KEYS.environmentId, envId);
    } else {
      await removePreference(KEYS.environmentId);
    }
  };

  const applyEnvironment = (envId: string | null, persist: boolean) => {
    const nextId =
      config.mode === 'managed'
        ? getInitialEnvironmentId(config, envId)
        : envId && config.items.some((item) => item.id === envId)
          ? envId
          : null;

    activeEnvironmentId = nextId;
    installRewriter();
    notify();
    callManagedChange();

    if (persist) {
      persistSelection(activeEnvironmentId).catch((err) => {
        if (__DEV__) {
          console.warn('[DebugToolkit] Failed to persist environment selection:', err);
        }
      });
    }
  };

  const loadPersistedSelection = async () => {
    try {
      const stored = await getPreference(KEYS.environmentId);
      applyEnvironment(getInitialEnvironmentId(config, stored), false);
    } catch (err) {
      if (__DEV__) {
        console.warn('[DebugToolkit] Failed to load persisted environment:', err);
      }
      applyEnvironment(getInitialEnvironmentId(config, null), false);
    }
  };

  return {
    name: 'environment',
    label: 'Environment',
    renderContent: EnvironmentTab,
    setup: () => {
      if (initialized) return;

      initialized = true;
      loadPersistedSelection();
    },
    getSnapshot: getCurrentState,
    clear: () => {
      const fallbackId = config.mode === 'managed' ? config.defaultId : null;
      applyEnvironment(fallbackId, true);
    },
    cleanup: () => {
      if (!initialized) return;
      setUrlRewriter(null);
      activeEnvironmentId = config.mode === 'managed' ? config.defaultId : null;
      notify();
      initialized = false;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerEnvironments: (envs: DebugEnvironmentInput) => {
      config = normalizeEnvironmentInput(envs);
      applyEnvironment(getInitialEnvironmentId(config, activeEnvironmentId), true);
    },
    switchEnvironment: (envId: string | null) => {
      applyEnvironment(envId, true);
    },
    getCurrentEnvironmentId: () => activeEnvironmentId,
    badge: () => {
      if (!activeEnvironmentId) return null;
      const env = config.items.find((e) => e.id === activeEnvironmentId);
      if (!env) return null;
      return {
        label: env.label.substring(0, 3).toUpperCase(),
        color: env.color ?? '#FF9500',
      };
    },
  };
};
```

- [ ] **Step 5: Run feature tests**

Run:

```bash
npm test -- src/__tests__/features/environmentFeature.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 6: Run regression tests for preferences**

Run:

```bash
npm test -- src/__tests__/utils/debugPreferences.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 7: Commit task 3**

```bash
git add src/utils/debugPreferences.ts src/features/environment/index.ts src/__tests__/features/environmentFeature.test.ts
git commit -m "feat: manage active debug environment"
```

---

### Task 4: Wire DebugView And Initialize Types

**Files:**
- Modify: `src/ui/DebugView.tsx`
- Modify: `src/core/initialize.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/core/initialize.test.ts`

- [ ] **Step 1: Add initialization regression test**

Append this test to `src/__tests__/core/initialize.test.ts`:

```ts
  it('accepts object-form environment config', async () => {
    await initializeDebugToolkit({
      enabled: true,
      features: {
        environment: {
          defaultId: 'prod',
          items: [
            { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
            { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
          ],
        },
      },
    });

    const environmentFeature = DebugToolkit.features.find((feature) => feature.name === 'environment');

    expect(environmentFeature).toBeDefined();
    expect(environmentFeature?.getSnapshot()).toMatchObject({
      mode: 'managed',
      defaultEnvironmentId: 'prod',
    });
  });
```

- [ ] **Step 2: Run test to verify current type/runtime fails**

Run:

```bash
npm test -- src/__tests__/core/initialize.test.ts --runInBand --watchman=false
```

Expected: PASS. This verifies `initializeDebugToolkit` can pass object-form environment config through to the feature factory after Task 3.

- [ ] **Step 3: Update DebugView prop type**

In `src/ui/DebugView.tsx`, change the environment type import:

```ts
import type { AnyDebugFeature, DebugEnvironmentInput, NavigationContainerRef } from '../types';
```

Change the prop type:

```ts
  /** Environment configs for runtime environment switching. */
  environments?: DebugEnvironmentInput;
```

Keep existing assignment:

```ts
    if (environments) {
      resolvedFeatures.environment = environments;
    }
```

- [ ] **Step 4: Update initialize type alias through createEnvironmentFeature**

In `src/core/initialize.ts`, keep this existing pattern:

```ts
  environment?: Parameters<typeof createEnvironmentFeature>[0];
```

After Task 3 changes `createEnvironmentFeature`, this accepts the new input. No runtime branching is needed in `initialize.ts`.

- [ ] **Step 5: Export new types**

In `src/index.ts`, add exports for the new types in the existing type export block:

```ts
export type {
  DebugEnvironment,
  DebugEnvironmentConfig,
  DebugEnvironmentInput,
  EnvironmentConfig,
  EnvironmentState,
} from './types';
```

If `src/index.ts` already exports `EnvironmentConfig` and `EnvironmentState`, replace that block with the code above.

- [ ] **Step 6: Run initialization test**

Run:

```bash
npm test -- src/__tests__/core/initialize.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 7: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit task 4**

```bash
git add src/ui/DebugView.tsx src/core/initialize.ts src/index.ts src/__tests__/core/initialize.test.ts
git commit -m "feat: wire managed environments into DebugView"
```

---

### Task 5: Update Environment Tab Display

**Files:**
- Modify: `src/features/environment/EnvironmentTab.tsx`
- Modify: `src/ui/panel/buildFeatureSummary.ts`
- Test: `src/__tests__/ui/panelFeatureSummary.test.ts`

- [ ] **Step 1: Add summary regression test**

Add this test to the `buildFeatureSummary` environment section in `src/__tests__/ui/panelFeatureSummary.test.ts`:

```ts
  it('environment: supports managed environment snapshots', () => {
    const f = mockFeature('environment');
    const snap = {
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      environments: [
        { id: 'prod', label: 'Production', mode: 'managed', urls: { app: 'https://api.example.com' } },
        { id: 'qa', label: 'QA', mode: 'managed', urls: { app: 'https://qa-api.example.com' } },
      ],
      currentEnvironmentId: 'qa',
    };
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(2);
    expect(s.latestLabel).toBe('QA');
    expect(s.statusLabel).toBe('QA');
  });
```

- [ ] **Step 2: Run test before UI changes**

Run:

```bash
npm test -- src/__tests__/ui/panelFeatureSummary.test.ts --runInBand --watchman=false
```

Expected: PASS. The summary helper should rely only on `id`, `label`, and `currentEnvironmentId` for environment snapshots.

- [ ] **Step 3: Update EnvironmentTab row text helpers**

In `src/features/environment/EnvironmentTab.tsx`, add helpers above the component:

```ts
function getEnvironmentColor(env: { id: string; color?: string }) {
  return env.color || DEFAULT_COLORS[env.id.toLowerCase()] || Colors.primary;
}

function getEnvironmentSubtitle(env: { host?: string; urls?: Record<string, string> }) {
  if (env.urls) {
    const keys = Object.keys(env.urls);
    return keys.length > 0 ? keys.join(', ') : 'No URLs configured';
  }
  return env.host ?? '';
}

function canResetEnvironment(state: EnvironmentState) {
  return state.mode === 'legacy';
}
```

Update the row rendering block to use:

```tsx
const color = getEnvironmentColor(env);
```

Replace the host text:

```tsx
<Text style={styles.envHost} numberOfLines={1}>
  {getEnvironmentSubtitle(env)}
</Text>
```

Change the footer reset button render:

```tsx
{canResetEnvironment(state) ? (
  <TouchableOpacity
    style={styles.resetButton}
    onPress={() => envFeature.switchEnvironment?.(null)}
    activeOpacity={0.7}
  >
    <Text style={styles.resetButtonText}>Reset</Text>
  </TouchableOpacity>
) : null}
```

Change the footer dot color:

```tsx
<View style={[styles.footerDot, { backgroundColor: getEnvironmentColor(activeEnv) }]} />
```

- [ ] **Step 4: Run UI-related tests**

Run:

```bash
npm test -- src/__tests__/ui/panelFeatureSummary.test.ts --runInBand --watchman=false
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit task 5**

```bash
git add src/features/environment/EnvironmentTab.tsx src/ui/panel/buildFeatureSummary.ts src/__tests__/ui/panelFeatureSummary.test.ts
git commit -m "feat: show managed environments in panel"
```

---

### Task 6: Document Environment Switching Usage

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Add English README section**

In `README.md`, under `## App Options` and before `### Disable features`, add:

````md
### Environment switching

Use object-form `environments` when an app needs in-app runtime environment switching.

```tsx
import { DebugView, type DebugEnvironment } from 'react-native-debug-toolkit';

async function applyEnvironment(env: DebugEnvironment) {
  configureApiClients(env.urls);
  queryClient.clear();
  await authStorage.clearTokens();
  signOut();
}

<DebugView
  environments={{
    defaultId: 'prod',
    items: [
      {
        id: 'prod',
        label: 'Production',
        urls: {
          auth: 'https://api.auth.example.com',
          app: 'https://api.app.example.com',
          shop: 'https://api.app.example.com/shop',
        },
      },
      {
        id: 'qa',
        label: 'QA',
        urls: {
          auth: 'https://qa-auth.example.com',
          app: 'https://qa-app.example.com',
          shop: 'https://qa-app.example.com/shop',
        },
      },
    ],
    onChange: applyEnvironment,
  }}
>
  <AppContent />
</DebugView>
```

The toolkit persists the selected environment, shows it in the `Environment` tab and launcher badge, and rewrites outgoing network URLs from the default environment URL prefixes to the selected environment URL prefixes.

Host apps with cached API clients, query caches, auth tokens, or router state should reset those resources in `onChange`. Treat environment switching as a session boundary.
````

- [ ] **Step 2: Add Chinese README section**

In `README.zh-CN.md`, under `## App 配置` and before `### 禁用功能`, add:

````md
### 环境切换

App 需要运行时切换环境时，使用对象形式的 `environments`。

```tsx
import { DebugView, type DebugEnvironment } from 'react-native-debug-toolkit';

async function applyEnvironment(env: DebugEnvironment) {
  configureApiClients(env.urls);
  queryClient.clear();
  await authStorage.clearTokens();
  signOut();
}

<DebugView
  environments={{
    defaultId: 'prod',
    items: [
      {
        id: 'prod',
        label: '生产',
        urls: {
          auth: 'https://api.auth.example.com',
          app: 'https://api.app.example.com',
          shop: 'https://api.app.example.com/shop',
        },
      },
      {
        id: 'qa',
        label: '测试',
        urls: {
          auth: 'https://qa-auth.example.com',
          app: 'https://qa-app.example.com',
          shop: 'https://qa-app.example.com/shop',
        },
      },
    ],
    onChange: applyEnvironment,
  }}
>
  <AppContent />
</DebugView>
```

Toolkit 会持久化当前环境，在 `Environment` Tab 和悬浮按钮 badge 中显示，并把默认环境 URL 前缀自动 rewrite 到当前环境 URL 前缀。

如果宿主 App 有缓存的 API client、query cache、auth token 或路由状态，需要在 `onChange` 里自行重置。环境切换应当视为一次会话边界。
````

- [ ] **Step 3: Run docs checks**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Commit task 6**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: document environment switching"
```

---

### Task 7: Full Verification

**Files:**
- Verify all files changed by Tasks 1-6.

- [ ] **Step 1: Run focused environment tests**

Run:

```bash
npm test -- src/__tests__/features/environmentConfig.test.ts src/__tests__/features/environmentRewrite.test.ts src/__tests__/features/environmentFeature.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 2: Run affected existing tests**

Run:

```bash
npm test -- src/__tests__/features/networkInterceptor.test.ts src/__tests__/utils/debugPreferences.test.ts src/__tests__/core/initialize.test.ts src/__tests__/ui/panelFeatureSummary.test.ts --runInBand --watchman=false
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Inspect public exports**

Run:

```bash
grep -R "DebugEnvironment" -n src/index.ts src/types/index.ts src/types/environment.ts
```

Expected: output includes `DebugEnvironment`, `DebugEnvironmentConfig`, and `DebugEnvironmentInput` exports.

- [ ] **Step 6: Inspect final status**

Run:

```bash
git status --short
```

Expected: no uncommitted files from environment switching work. Pre-existing unrelated files may remain if they were already dirty before implementation.
