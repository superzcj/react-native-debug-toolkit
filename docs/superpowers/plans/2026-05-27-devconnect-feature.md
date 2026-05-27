# DevConnect Native Metro Bundle Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DevConnect apply a computer Metro bundler host directly from the debug panel, while keeping desktop log sync easy on real devices.

**Architecture:** DevConnect stores `computerHost`, `metroPort`, and `daemonPort` separately. JS validates Metro with `GET /status`, then calls a small native module that writes React Native's dev-server host setting and reloads JS. Desktop logs still use the existing daemon client.

**Tech Stack:** React Native JS/TS, Jest, iOS Objective-C bridge, Android Java bridge, CocoaPods, React Native autolinking.

---

## Decisions

- No copy buttons for Remote JS Bundle.
- Real device input is computer IP plus ports.
- Metro defaults to `8081`; desktop logs daemon defaults to `3799`.
- QR payloads like `exp://192.168.1.10:8082` set both IP and Metro port.
- Native install is required for one-tap Remote JS Bundle.
- Expo Go is unsupported for this native feature; Expo dev build/prebuild is supported.
- If AsyncStorage is missing, preferences persist through the native module after rebuild.

## Tasks

### Task 1: Ports And Persistence

**Files:**
- Modify: `src/features/devConnect/devConnectUtils.ts`
- Modify: `src/features/devConnect/devConnectPreferences.ts`
- Modify: `src/utils/debugPreferences.ts`
- Test: `src/__tests__/features/devConnectUtils.test.ts`
- Test: `src/__tests__/features/devConnectPreferences.test.ts`
- Test: `src/__tests__/utils/debugPreferences.test.ts`

- [x] Parse plain IP, `IP:port`, `exp://IP:port`, and `http://IP:port/...`.
- [x] Persist `computerHost`, `metroPort`, and `daemonPort`.
- [x] Keep Metro and daemon ports independent.
- [x] Use native preference storage as fallback when AsyncStorage is absent.

### Task 2: Native Metro Host Bridge

**Files:**
- Create: `src/features/devConnect/nativeDevConnect.ts`
- Create: `ios/DebugToolkitDevConnect.mm`
- Create: `android/src/main/java/com/reactnativedebugtoolkit/DebugToolkitDevConnectModule.java`
- Create: `android/src/main/java/com/reactnativedebugtoolkit/ReactNativeDebugToolkitPackage.java`
- Create: `react-native-debug-toolkit.podspec`
- Create: `android/build.gradle`
- Test: `src/__tests__/features/nativeDevConnect.test.ts`

- [x] Check Metro status before applying native host.
- [x] iOS writes `RCTBundleURLProvider.sharedSettings.jsLocation`.
- [x] Android writes React Native `debug_http_host`.
- [x] Reset clears native Metro host.
- [x] Package native files for autolinking.

### Task 3: DevConnect UI

**Files:**
- Modify: `src/features/devConnect/DevConnectTab.tsx`
- Modify: `src/features/devConnect/DevConnectQrScanner.tsx`
- Modify: `src/features/devConnect/types.ts`
- Modify: `src/features/devConnect/index.ts`
- Test: `Demo/__tests__/App.test.tsx`

- [x] Remove copy flow.
- [x] Show `Use Metro Bundle` and `Reset`.
- [x] Show HTTP and Expo URL as read-only diagnostics.
- [x] Keep `Send Once` and `Live Sync` for desktop logs.
- [x] Disable native Metro actions until native module is available.

### Task 4: Docs And Release Gates

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/product-roadmap.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] Document native installation.
- [x] Document Expo Go limitation.
- [x] Sync package lock.
- [x] Run focused tests, typecheck, build, and pack dry run.
