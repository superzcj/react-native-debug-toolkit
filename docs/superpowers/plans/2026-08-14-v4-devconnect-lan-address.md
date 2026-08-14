# v4 DevConnect LAN Address Assistance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Restore v3's LAN subnet hint in the v4 Hub address screen, retain a manually entered Hub address, and show the configured env endpoint as a second recommendation.

**Architecture:** Native Toolkit code returns the phone's usable IPv4. TypeScript derives a three-segment prefix and exposes it in DevConnect state. The v4 feature loads the Toolkit-owned MMKV override before configuring the Hub, but keeps the host-supplied endpoint separately so it remains an explicit recommendation. The full address input remains authoritative.

**Tech Stack:** React Native TypeScript, Android Java, Objective-C++, react-native-mmkv, Jest.

## Global Constraints

- Do not add dependencies or pass storage from JX; use Toolkit-owned MMKV through \`debugPreferences\`.
- iOS prefers \`en0\`; Android prefers active \`wlan*\`/\`eth*\`; both may fall back to an active non-loopback IPv4.
- Recommendation order is exactly detected \`a.b.c.\`, then the normalized configured endpoint when it exists.
- Recommendations only seed and focus the field. Upload and live logs remain explicit actions.

---

### Task 1: Model LAN address recommendations

**Files:**
- Create: \`src/features/devConnect/hubAddressRecommendations.ts\`
- Create: \`src/__tests__/features/hubAddressRecommendations.test.ts\`

**Interfaces:**
- Produces \`extractIpv4SubnetPrefix(ip: string): string | null\`.
- Produces \`buildHubAddressRecommendations({ subnetPrefix, configuredEndpoint }): readonly HubAddressRecommendation[]\`, where each item is \`{ kind: 'subnet' | 'configured'; value: string }\`.

- [ ] **Step 1: Write the failing unit tests**

\`\`\`ts
expect(extractIpv4SubnetPrefix('192.168.1.45')).toBe('192.168.1.');
expect(extractIpv4SubnetPrefix('10.0.0.7')).toBe('10.0.0.');
expect(extractIpv4SubnetPrefix('fe80::1')).toBeNull();
expect(extractIpv4SubnetPrefix('192.168.1.999')).toBeNull();

expect(buildHubAddressRecommendations({
  subnetPrefix: '192.168.1.',
  configuredEndpoint: 'http://192.168.1.203:3800',
})).toEqual([
  { kind: 'subnet', value: '192.168.1.' },
  { kind: 'configured', value: 'http://192.168.1.203:3800' },
]);
\`\`\`

- [ ] **Step 2: Run the focused test before implementation**

Run: \`pnpm exec jest --runInBand src/__tests__/features/hubAddressRecommendations.test.ts\`

Expected: FAIL because the helper module is absent.

- [ ] **Step 3: Add the minimal pure helper**

\`\`\`ts
export function extractIpv4SubnetPrefix(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || !parts.every((part) => /^\\d{1,3}$/.test(part) && Number(part) <= 255)) {
    return null;
  }
  return parts.slice(0, 3).join('.') + '.';
}
\`\`\`

Build the list with the subnet item first when non-null and the configured item second when non-empty.

- [ ] **Step 4: Run the focused test**

Run: \`pnpm exec jest --runInBand src/__tests__/features/hubAddressRecommendations.test.ts\`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

\`\`\`bash
git add src/features/devConnect/hubAddressRecommendations.ts src/__tests__/features/hubAddressRecommendations.test.ts
git commit -m "feat: add Hub address recommendations"
\`\`\`

### Task 2: Restore the local-IPv4 bridge

**Files:**
- Modify: \`android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitDevConnectModule.java\`
- Modify: \`ios/DebugToolkitDevConnect.mm\`
- Modify: \`src/features/devConnect/nativeDevConnect.ts\`
- Modify: \`src/__tests__/features/nativeDevConnect.test.ts\`
- Modify: \`src/__tests__/features/nativeDevConnectSource.test.ts\`

**Interfaces:**
- Produces \`getDeviceLocalIp(): Promise<string | null>\`.

- [ ] **Step 1: Write failing bridge and source-contract tests**

\`\`\`ts
NativeModules.DebugToolkitDevConnect = {
  isDebugBuild: jest.fn(),
  getLocalIp: jest.fn().mockResolvedValue('192.168.1.45'),
};
await expect(getDeviceLocalIp()).resolves.toBe('192.168.1.45');

expect(androidSource).toContain('getLocalIp');
expect(androidSource).toContain('NetworkInterface');
expect(iosSource).toContain('getLocalIp');
expect(iosSource).toContain('getifaddrs');
\`\`\`

- [ ] **Step 2: Run the native tests before implementation**

Run: \`pnpm exec jest --runInBand src/__tests__/features/nativeDevConnect.test.ts src/__tests__/features/nativeDevConnectSource.test.ts\`

Expected: FAIL because the bridge method is absent.

- [ ] **Step 3: Port the bounded v3 implementation**

Add \`getLocalIp\` to the JS native-module type and return a string only when the native method resolves one. Port the prior native search: Android enumerates active non-loopback \`Inet4Address\` values and prefers interface names beginning \`wlan\` or \`eth\`; iOS uses \`getifaddrs\`, prefers \`en0\`, then another non-loopback \`AF_INET\` address. Both implementations resolve \`null\` for every error path and request no permission.

- [ ] **Step 4: Run the native tests**

Run: \`pnpm exec jest --runInBand src/__tests__/features/nativeDevConnect.test.ts src/__tests__/features/nativeDevConnectSource.test.ts\`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

\`\`\`bash
git add android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitDevConnectModule.java ios/DebugToolkitDevConnect.mm src/features/devConnect/nativeDevConnect.ts src/__tests__/features/nativeDevConnect.test.ts src/__tests__/features/nativeDevConnectSource.test.ts
git commit -m "feat: restore DevConnect local IP lookup"
\`\`\`

### Task 3: Load saved endpoint and recommendation state

**Files:**
- Modify: \`src/utils/debugPreferences.ts\`
- Modify: \`src/features/devConnect/types.ts\`
- Modify: \`src/features/devConnect/index.ts\`
- Modify: \`src/__tests__/utils/debugPreferences.test.ts\`
- Modify: \`src/__tests__/features/devConnectV4Feature.test.ts\`

**Interfaces:**
- Adds \`KEYS.hubEndpoint = '@react_native_debug_toolkit/hub_endpoint'\`.
- Adds \`configuredEndpoint: string\` and \`subnetPrefix: string | null\` to \`DevConnectV4State\`.

- [ ] **Step 1: Write failing precedence tests**

\`\`\`ts
mockGetPreference.mockResolvedValue('http://192.168.1.123:3800');
mockGetDeviceLocalIp.mockResolvedValue('192.168.1.45');
feature.setup();
await flushPromises();

expect(configure).toHaveBeenCalledWith({
  appId: 'com.example.audit',
  endpoint: 'http://192.168.1.123:3800',
});
expect(feature.getSnapshot()).toMatchObject({
  canonicalEndpoint: 'http://192.168.1.123:3800',
  configuredEndpoint: 'http://192.168.1.203:3800',
  subnetPrefix: '192.168.1.',
});
expect(KEYS.hubEndpoint).toBe('@react_native_debug_toolkit/hub_endpoint');
\`\`\`

- [ ] **Step 2: Run the persistence/setup tests before implementation**

Run: \`pnpm exec jest --runInBand src/__tests__/utils/debugPreferences.test.ts src/__tests__/features/devConnectV4Feature.test.ts\`

Expected: FAIL because the key and state are absent.

- [ ] **Step 3: Implement explicit source precedence**

In \`setup\`, load \`KEYS.hubEndpoint\` and \`getDeviceLocalIp()\` concurrently. Normalize a saved endpoint with \`normalizeHubEndpoint\`; configure \`hubClient\` with saved endpoint, otherwise the already normalized configured endpoint. Keep the configured endpoint unchanged in state for its recommendation. Derive the prefix with Task 1 and notify after state is complete. Preserve the existing Debug-only discovery and auto-connect sequence after configuration.

- [ ] **Step 4: Run the persistence/setup tests**

Run: \`pnpm exec jest --runInBand src/__tests__/utils/debugPreferences.test.ts src/__tests__/features/devConnectV4Feature.test.ts\`

Expected: PASS; manual override, env fallback, and LAN prefix are distinct.

- [ ] **Step 5: Commit Task 3**

\`\`\`bash
git add src/utils/debugPreferences.ts src/features/devConnect/types.ts src/features/devConnect/index.ts src/__tests__/utils/debugPreferences.test.ts src/__tests__/features/devConnectV4Feature.test.ts
git commit -m "feat: retain DevConnect Hub address"
\`\`\`

### Task 4: Render and persist user selections

**Files:**
- Modify: \`src/features/devConnect/DevConnectTabV4.tsx\`
- Modify: \`src/__tests__/features/hubAddressRecommendations.test.ts\`

**Interfaces:**
- Consumes Task 1 recommendations and Task 3 state/preference key.
- Produces two tappable recommendations and persisted valid manual input.

- [ ] **Step 1: Extend the pure recommendation test**

\`\`\`ts
const items = buildHubAddressRecommendations({
  subnetPrefix: '192.168.1.',
  configuredEndpoint: 'http://192.168.1.203:3800',
});
expect(items[0]).toEqual({ kind: 'subnet', value: '192.168.1.' });
expect(items[1]).toEqual({ kind: 'configured', value: 'http://192.168.1.203:3800' });
\`\`\`

- [ ] **Step 2: Run the test before UI wiring**

Run: \`pnpm exec jest --runInBand src/__tests__/features/hubAddressRecommendations.test.ts\`

Expected: PASS; recommendation ordering remains a tested UI input.

- [ ] **Step 3: Implement the field behavior**

Add a \`TextInput\` ref. Render recommendations under the address field in their supplied order: subnet copy is \`Use 192.168.1.\` and its tap sets just the prefix and focuses the input; configured copy shows the full normalized endpoint and sets it exactly. On valid submit/blur, save the normalized endpoint in \`KEYS.hubEndpoint\` before calling \`hubClient.setRuntimeEndpoint\`. On blank submit/blur, remove that key, call \`clearRuntimeEndpoint\`, and reset input to \`snapshot.configuredEndpoint\` or an empty string. Invalid text is never saved.

- [ ] **Step 4: Run all feature-focused tests**

Run: \`pnpm exec jest --runInBand src/__tests__/features/hubAddressRecommendations.test.ts src/__tests__/features/devConnectV4Feature.test.ts src/__tests__/features/nativeDevConnect.test.ts src/__tests__/features/nativeDevConnectSource.test.ts src/__tests__/utils/HubEndpointResolver.test.ts\`

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

\`\`\`bash
git add src/features/devConnect/DevConnectTabV4.tsx src/__tests__/features/hubAddressRecommendations.test.ts
git commit -m "feat: suggest DevConnect LAN addresses"
\`\`\`

### Task 5: Document and verify the feature

**Files:**
- Modify: \`README.md\`
- Modify: \`README.zh-CN.md\`

**Interfaces:**
- Consumes the completed DevConnect address behavior.
- Produces concise internal/Release connection guidance.

- [ ] **Step 1: Add the exact usage note**

Near the existing \`devConnect\` configuration example, document in English and Chinese: the env endpoint is an optional recommendation; without one a real device offers its detected LAN prefix; choosing either does not upload until \`Upload Once\` or \`Start Live Logs\`.

- [ ] **Step 2: Inspect documentation formatting**

Run: \`git diff --check && rg -n 'LAN prefix|局域网前缀|Upload Once|上传一次' README.md README.zh-CN.md\`

Expected: no whitespace error and both documents state the explicit-start boundary.

- [ ] **Step 3: Run full Toolkit verification**

Run: \`pnpm exec jest --runInBand && pnpm run typecheck && pnpm run build && pnpm exec eslint src/features/devConnect src/utils/debugPreferences.ts\`

Expected: all Toolkit tests, typecheck, build, and touched-source lint pass.

- [ ] **Step 4: Commit Task 5**

\`\`\`bash
git add README.md README.zh-CN.md
git commit -m "docs: explain DevConnect LAN address suggestions"
\`\`\`

