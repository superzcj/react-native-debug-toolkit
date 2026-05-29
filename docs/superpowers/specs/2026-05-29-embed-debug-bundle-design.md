# Debug Bundle Embed Design

## Problem

Host apps building debug packages have no embedded JS bundle. iOS/Android debug builds default to loading from Metro dev server, so cold starts without Metro fail. Users need: embedded JS bundle for cold start + DevConnect dynamic Metro host switching.

## Solution

`npx debug-toolkit embed` — one CLI command that hooks into the host app's existing RN build infrastructure to force JS bundle generation during debug builds.

## Architecture

```
npx debug-toolkit embed
├── Detect project type (RN native / Expo)
├── iOS: Inject FORCE_BUNDLING=1 into existing Xcode Script Phase
├── Android: Apply external Gradle script via app/build.gradle
└── Generate .debug-toolkit-embed.json (state tracking)
```

At build time, RN's own bundling scripts generate the JS bundle. At runtime, existing DevConnect hooks load the embedded bundle on cold start, then optionally switch to a Metro host.

## iOS Implementation

Reuse RN's existing `FORCE_BUNDLING` mechanism in `react-native-xcode.sh`.

### embed command

1. Locate `*.xcodeproj` (exclude Pods). Multiple projects: interactive selection.
2. Find "Bundle React Native code and images" Script Phase.
3. Prepend `export FORCE_BUNDLING=1` to the script body.
4. Record script phase ID in `.debug-toolkit-embed.json` for undo.

### undo

Remove the `export FORCE_BUNDLING=1` line from the Script Phase.

### Why this works

`react-native-xcode.sh` lines 38-39: when `FORCE_BUNDLING` is set, bundling proceeds even for Debug+Simulator builds. No modification to RN's scripts needed.

## Android Implementation

RN's Gradle plugin skips bundle tasks for debuggable variants (`debuggableVariants` defaults to `['debug']`). No force flag exists. Solution: external Gradle script that calls `npx react-native bundle`.

### embed command

1. Locate `app/build.gradle` or `app/build.gradle.kts`.
2. Append `apply from: "../../node_modules/react-native-debug-toolkit/scripts/android-debug-bundle.gradle"`.
3. The external script registers a `generateDebugBundle` Exec task that runs `npx react-native bundle --platform android --dev true`.
4. Task wired as dependency of `preBuild`, disabled for Release variants.

### android-debug-bundle.gradle

```groovy
tasks.register('generateDebugBundle', Exec) {
    commandLine 'npx', 'react-native', 'bundle',
        '--platform', 'android',
        '--dev', 'true',
        '--entry-file', project.ext.has('debugToolkitEntryFile')
            ? project.ext.debugToolkitEntryFile : 'index.js',
        '--bundle-output', "${projectDir}/src/main/assets/index.android.bundle",
        '--assets-dest', "${projectDir}/src/main/res"
}
afterEvaluate {
    tasks.matching { it.name.contains('Release') }.configureEach {
        tasks.named('generateDebugBundle').get().enabled = false
    }
    android.applicationVariants.matching { it.buildType.name == 'debug' }.configureEach {
        preBuildProvider.configure { dependsOn 'generateDebugBundle' }
    }
}
```

### undo

Remove the `apply from` line from `app/build.gradle`.

### Assets directory

Script auto-creates `app/src/main/assets/` if absent.

## Expo Support

### Detection

- Has `app.json`/`app.config.js` with `expo` field, or `expo` in dependencies.

### Expo Go

Skip. Display message: "Expo Go doesn't support embedded bundles. Use dev-client."

### Expo Dev Client (bare/prebuild)

After `npx expo prebuild`, `ios/` and `android/` directories exist. Apply iOS and Android logic as normal.

### EAS Build

Generate `scripts/eas-postinstall.sh` that runs `npx debug-toolkit embed --yes`. User adds to `eas.json`:

```json
{
  "build": {
    "debug": {
      "profile": "development",
      "postInstall": "bash node_modules/react-native-debug-toolkit/scripts/eas-postinstall.sh"
    }
  }
}
```

`--yes` flag skips all interactive prompts (EAS has no TTY).

## Entry File Detection

Priority order:
1. `index.js`
2. `index.ts`
3. `index.tsx`
4. `.expo/.virtual-metro-entry` (Expo)
5. Read from `app.json` → `expo.entryPoint` if Expo project

## Configuration File

`.debug-toolkit-embed.json` in project root:

```json
{
  "version": 1,
  "ios": {
    "xcodeproj": "ios/MyApp.xcodeproj",
    "scriptPhaseId": "xxx",
    "entryFile": "index.js"
  },
  "android": {
    "buildGradle": "android/app/build.gradle",
    "entryFile": "index.js"
  }
}
```

Used for: undo, idempotent re-runs, status checks.

## CLI Interface

```
npx debug-toolkit embed                        # Interactive, detect & inject all platforms
npx debug-toolkit embed --platform ios         # iOS only
npx debug-toolkit embed --platform android     # Android only
npx debug-toolkit embed --undo                 # Rollback all injections
npx debug-toolkit embed --yes                  # Skip confirmations (CI/EAS)
```

## DevConnect Integration (Existing, No Changes)

1. App cold start → iOS hook loads embedded `main.jsbundle` → app runs.
2. User sets Metro host via Web Console.
3. Next launch → hook detects configured host → connects to Metro for dynamic loading.
4. Clear host → falls back to embedded bundle.

## New Files

```
scripts/
├── embed.js                     # embed/undo command main logic
├── embed-ios.js                 # iOS Script Phase manipulation
├── embed-android.js             # Android Gradle apply-from injection
├── embed-expo.js                # Expo detection & adaptation
├── android-debug-bundle.gradle  # Android debug bundle Gradle task
└── eas-postinstall.sh           # EAS Build postInstall script
```

## New Dependency

- `pbxproj` — Xcode project file manipulation (RN community standard, used by react-native-link).

## Scope Exclusions

- No modification to existing native hook code (DevConnect).
- No custom Metro plugin.
- No custom bundling logic — reuses RN's `react-native bundle` CLI.
- No React Native version below 0.72 support.
