# Toolkit-Owned MMKV Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `react-native-debug-toolkit` own one MMKV-backed persistence store so JX no longer supplies log, preference, or Quick Accounts storage.

**Architecture:** `react-native-mmkv` becomes a direct Toolkit dependency. `createDefaultLogStorage()` lazily creates one `react-native-debug-toolkit` MMKV adapter; log runtime, UI preferences, and Quick Accounts use that singleton. `DebugView` and JX host layouts expose no storage-injection props.

**Tech Stack:** React Native, react-native-mmkv 4.3.1, TypeScript, Jest, pnpm, Expo Metro.

## Global Constraints

- `react-native-mmkv` is a hard runtime dependency at `^4.3.1`.
- No `@react-native-async-storage/async-storage` dependency, fallback, resolver alias, or patch remains.
- Toolkit data uses the isolated MMKV id `react-native-debug-toolkit`.
- JX pins Toolkit to the resulting exact Git commit in every direct manifest and root override.

---

### Task 1: Make Toolkit persistence MMKV-owned

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify: `src/utils/StorageAdapter.ts`, `src/utils/logRuntime.ts`, `src/utils/debugPreferences.ts`
- Modify: `src/core/initialize.ts`, `src/ui/DebugView.tsx`, `src/index.ts`
- Test: `src/__tests__/utils/StorageAdapter.test.ts`, `src/__tests__/utils/debugPreferences.test.ts`, `src/__tests__/core/initialize.test.ts`

**Interfaces:**
- Produces: `createDefaultLogStorage(): StorageAdapter`, returning the process-wide Toolkit MMKV adapter.
- Removes: `DebugViewProps.logStorage`, `DebugViewProps.preferenceStorage`, and host preference registration.

- [ ] **Step 1: Write failing default-storage tests**

```ts
const first = createDefaultLogStorage();
const second = createDefaultLogStorage();
expect(first).toBe(second);
expect(mockCreateMMKV).toHaveBeenCalledWith({ id: 'react-native-debug-toolkit' });
```

- [ ] **Step 2: Run the storage tests and verify they fail**

Run: `pnpm exec jest --runInBand src/__tests__/utils/StorageAdapter.test.ts`

Expected: the previous per-call optional loader uses `debug-toolkit-logs`, so the singleton/id assertion fails.

- [ ] **Step 3: Implement the direct MMKV singleton**

```ts
import { createMMKV } from 'react-native-mmkv';

let defaultStorage: StorageAdapter | null = null;
export function createDefaultLogStorage(): StorageAdapter {
  defaultStorage ??= new MMKVStorageAdapter(createMMKV({ id: 'react-native-debug-toolkit' }));
  return defaultStorage;
}
```

Move `react-native-mmkv` to `dependencies` at `^4.3.1`; remove the optional AsyncStorage peer and loader classes. Route preferences through `createDefaultLogStorage()` and remove host preference registration.

- [ ] **Step 4: Verify Toolkit tests and static checks**

Run: `pnpm exec jest --runInBand`, `pnpm run typecheck`, `pnpm run build`, and `pnpm exec eslint src/**/*.ts src/**/*.tsx`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src
git commit -m "refactor: own Toolkit persistence with MMKV"
```

### Task 2: Remove JX storage injection and pin the release

**Files:**
- Modify: `packages/main/src/runtime/MainRootLayout.tsx`, `packages/pda/src/runtime/PdaRootLayout.tsx`
- Modify: `packages/main/src/runtime/debug-quick-accounts/feature.tsx`
- Modify: `packages/main/src/runtime/__tests__/MainRootLayout.test.tsx`, `packages/main/src/runtime/__tests__/debug-quick-accounts-feature.test.ts`
- Modify: root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, all app/package manifests declaring Toolkit
- Modify: `docs/architecture/overview.md`

**Interfaces:**
- Consumes: Toolkit default storage from Task 1.
- Produces: all JX shells use Toolkit storage without `StorageAdapter` construction or prop passing.

- [ ] **Step 1: Write failing JX integration expectations**

```ts
expect(mockCreateToolkitQuickAccountsFeature).toHaveBeenCalledWith(
  expect.not.objectContaining({ storage: expect.anything() }),
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @jx/main exec jest --runInBand src/runtime/__tests__/debug-quick-accounts-feature.test.ts`

Expected: JX still supplies `storage` from `@jx/infra`.

- [ ] **Step 3: Remove host adapters and update the exact Toolkit SHA**

Remove storage imports/objects and `DebugView` props in owner/PDA layouts. Remove Quick Accounts `storage` from JX. Pin all direct JX Toolkit specs plus the root override to the committed Task 1 SHA, run `pnpm install`, and keep Metro resolver free of storage special cases.

- [ ] **Step 4: Verify JX packaging**

Run: `pnpm install --frozen-lockfile`, focused JX tests, and `pnpm --filter dw-main exec expo export --platform ios --no-bytecode` plus the equivalent `dw-pda` export to temporary directories.

- [ ] **Step 5: Synchronize current architecture documentation**

State that Toolkit persists its isolated MMKV data itself; remove the host-injection description.

