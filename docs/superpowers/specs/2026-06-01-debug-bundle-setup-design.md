# Debug Bundle Setup Design

Date: 2026-06-01

## Decision

Build bundle embedding as a persistent host-app build configuration, not a per-build `embed`
command.

The user flow is:

```bash
npx debug-toolkit setup-bundle
git diff
git commit -am "chore: enable debug bundle embedding"
```

After setup, CI and local machines keep using normal host app build commands. No CI job should need
to run `debug-toolkit` before every build.

## Problem

Debug builds commonly start from Metro. If Metro is unavailable and the app package has no embedded
JS bundle, the debug package red screens on cold start.

The earlier `embed` design failed because it was too weak:

- Android registered one global `generateDebugBundle` task and wired it to `preBuild`; that does
  not prove generated assets enter the actual debug APK.
- Android wrote to `src/main/assets`, creating source-tree side effects and bypassing the Android
  variant asset pipeline.
- Android disabled the single task through a release-task name match, so debug behavior could be
  affected by unrelated release tasks.
- Kotlin Gradle files were detected, but the injected snippet was Groovy.
- iOS picked the first Xcode project when multiple projects existed.
- iOS only injected `FORCE_BUNDLING`, but did not verify the edited script phase belongs to the app
  target or still calls React Native's bundling script.
- The config file was only state tracking; it did not make builds work.

## Product Scope

`setup-bundle` owns build setup only:

- make debug/development builds include an embedded JS bundle;
- make setup idempotent and reversible;
- fail loudly when the host project shape is ambiguous;
- provide `doctor-bundle` to verify source config and built artifacts.

DevConnect owns runtime only:

- set Metro host;
- reload from Metro when Metro is reachable;
- reset to embedded/default;
- never bypass React Native's own packager reachability fallback.

Web Console is not part of this scope. It has no reliable command channel to mutate device-side
Metro host yet.

## CLI

```bash
npx debug-toolkit setup-bundle
npx debug-toolkit setup-bundle --platform ios
npx debug-toolkit setup-bundle --platform android
npx debug-toolkit setup-bundle --undo
npx debug-toolkit setup-bundle --check
npx debug-toolkit doctor-bundle --platform ios --app <path-to-.app>
npx debug-toolkit doctor-bundle --platform android --apk <path-to.apk>
```

Keep `embed` as a deprecated alias for one release, printing a warning and routing to
`setup-bundle`.

## iOS Design

Use React Native's own `react-native-xcode.sh` path.

Setup must:

1. Parse `ios/*.xcodeproj/project.pbxproj`.
2. Find native application targets, not arbitrary shell phases.
3. Find the target's `Bundle React Native code and images` phase.
4. Verify the script calls React Native bundling, such as `react-native-xcode.sh` or
   `with-environment.sh`.
5. Insert a marked block before the script call:

   ```sh
   # react-native-debug-toolkit: begin debug bundle
   export FORCE_BUNDLING=1
   # react-native-debug-toolkit: end debug bundle
   ```

6. Refuse ambiguous multi-target projects unless the user passes `--ios-target`.
7. Run a post-edit check by reading the same target and confirming the marker exists in the correct
   phase.

Undo removes only the marked block.

`doctor-bundle --app` verifies the built `.app` contains `main.jsbundle`.

## Android Design

Do not write `android/app/src/main/assets`. Do not use `preBuild` as proof of packaging.

Setup must:

1. Detect `android/app/build.gradle` or `android/app/build.gradle.kts`.
2. Inject a language-matched apply/plugin line:

   Groovy:

   ```groovy
   apply from: "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle"
   ```

   Kotlin:

   ```kotlin
   apply(from = "../../node_modules/react-native-debug-toolkit/scripts/debug-bundle.gradle")
   ```

3. The Gradle script registers one task per debuggable variant.
4. Each task writes generated bundle/assets under `build/generated/react-native-debug-toolkit/<variant>/`.
5. The script registers those directories with AGP variant sources, so `merge<Variant>Assets` and
   resource merge consume them.
6. Task names are variant-scoped, for example `createDebugToolkitDebugJsAndAssets`.
7. The task uses the host React Native config where possible: root, CLI, entry file,
   `bundleAssetName`, bundle config, extra packager args, Hermes settings.
8. Bundle command uses `--dev true` for debug/development variants.
9. Setup post-check runs `./gradlew :app:tasks --all` and verifies the expected task exists for the
   debug variant.

`doctor-bundle --apk` verifies the built APK contains `assets/index.android.bundle` or the configured
RN bundle asset name.

## Expo Design

Expo Go is unsupported.

Expo dev-client/prebuild gets a config plugin:

```json
{
  "expo": {
    "plugins": [
      ["react-native-debug-toolkit/dev-client", { "embedBundle": true }]
    ]
  }
}
```

The plugin applies the same iOS and Android setup during prebuild. EAS works because config lives in
`app.json`/`app.config.*`; no `postInstall` mutation step is needed.

## Runtime Contract

Runtime must stay close to RN Dev Menu behavior:

- iOS sets `RCTBundleURLProvider.sharedSettings.jsLocation`, then reloads.
- Android sets `PackagerConnectionSettings.debugServerHost`, then reloads.
- If configured Metro is unreachable on next launch, RN's own reachability check must be allowed to
  fall back to embedded bundle.
- DebugToolkit must not replace `packagerServerHostPort` with logic that returns stale host without
  checking Metro status.

## Verification

Required checks before calling implementation complete:

1. `setup-bundle --check` on a bare RN sample.
2. `setup-bundle --undo` removes only DebugToolkit markers.
3. Android debug APK contains the bundle.
4. iOS debug `.app` contains `main.jsbundle`.
5. Metro off cold start does not red screen.
6. Metro on DevConnect switch reloads from Metro.
7. Metro off after a persisted host falls back to embedded bundle.
8. Existing release gates still pass: typecheck, lint, test, build, pack dry run.

## Non-Goals

- No per-build mutation command.
- No Web Console host mutation.
- No Release bundle switching.
- No support for Expo Go.
- No support for React Native below 0.72.
