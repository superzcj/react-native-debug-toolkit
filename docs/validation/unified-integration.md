# Unified integration acceptance

The 2026-09-22 run recorded **8 passed, 1 failed and 11 not_run cases**. Full integration acceptance is **incomplete**. RN 0.85.1 passed a real iOS Debug build; RN 0.76.6 failed the required Android native autolinking check. Device pages, Release behavior and current-session Hub events remain unverified.

This report was initialized with every required case as `not_run`, then updated from this run's commands. A successful test, autolink, Pod install or bundle does not count as a native build or device result. [Structured evidence](unified-integration.evidence.json) contains the per-case commands, exits, runtime versions, identities and paths.

Artifact: `react-native-debug-toolkit@5.0.0`, 766 files, SHA-256 `bfd37513c0cd4308143ffc628317b9fbdd5361edfb6d97a97dfd26d35fb08a8d`. Product source commit: `a0972e07669414da6c89a727e9a9a4a87257c421`. This task changes validation artifacts only; it does not change the packed SDK.

## Evidence format

Each case records: `case`, package version and tarball SHA-256, RN/React/platform/build mode, App ID, Session ID, build identity, unique marker, commands, actual result, evidence path, and `status` (`passed`, `failed`, `not_run`). Non-app checks use `null` for app/session/marker. Environment-blocked acceptance remains `not_run` even when a prerequisite command was attempted; its exit code and blocker are still recorded. `failed` means the acceptance assertion ran and failed.

Device evidence must originate in the current installed build and contain its marker and identity. `/ready`, historical Hub data, mocks and renderer tests cannot supply that evidence. Missing tooling or device control is an explicit blocker, never a successful result.

## Required matrix

| Case | Required evidence | Status |
| --- | --- | --- |
| package | Bob build and strict verifier: 766 files | passed |
| root-checks | 68 suites / 674 tests; root and public API types | passed |
| demo-checks | 7 suites / 30 renderer tests; 3 real HTTP tests; types and lint | passed |
| docs-checks | Both languages: 44 fields/defaults; compiled examples; 23 script tests | passed |
| consumer-current | Clean RN 0.85.1 install, types, 1 renderer test, Metro and autolink | passed |
| ios-current-debug | Consumer's own 79 Pods and actual Debug build; no launch claim | passed |
| android-current-debug | Consumer Gradle Debug build and device launch | not_run |
| consumer-minimum | Install/types pass; MMKV Android autolink is null | failed |
| ios-minimum-debug | RN 0.76.6 Pods and Debug build | not_run |
| android-minimum-debug | RN 0.76.6 Gradle Debug build | not_run |
| release-default | Native Release: no panel, collectors, timers, sources, storage or Hub traffic | not_run |
| release-enabled | Native Release enabled: local pages, no automatic discovery/upload, manual send only | not_run |
| zero-config-pages | Open all twelve pages; real Console/HTTP; empty and unavailable states | not_run |
| current-hub-session | Current marker plus matching App/Session/build identity | not_run |
| showcase-flow | Real 409 → environment switch → 201; State/Track/Navigation/copy | not_run |
| history-restart | Off: no log disk IO, preferences retained; on: previous history restored | not_run |
| remount-refresh | Mount/unmount and Fast Refresh produce exactly one event | not_run |
| ai-docs-integration | Independent blank fixture, public docs only, patch and commands | passed |
| ai-docs-device | AI-created integration builds/runs and captures current Console/HTTP | not_run |
| ai-docs-idempotency | Second documentation pass retains one root host | passed |

## Results

The final full checks all exited 0: root Jest/typecheck/API types; Demo Jest/HTTP API/types/lint; documentation fields/examples; all 23 Node script tests; Bob build and real-tarball verification. The focused Release, storage and lifecycle matrix also passed 81 tests. Native boundaries in Jest/renderer tests are mocked, so these results do not fill the device rows.

The evidence validator itself has 7 behavioral tests, including rejection of missing cases, invalid statuses, unsupported success claims, missing current identity, non-public AI inputs and a duplicated host on the second AI pass. These tests were observed failing before implementation. The checker validates the shape and claim boundaries of recorded evidence; a human still has to assess the underlying observations.

```sh
rtk proxy node --test scripts/__tests__/check-integration-evidence.test.mjs
rtk proxy node scripts/check-integration-evidence.mjs docs/validation/unified-integration.evidence.json
rtk proxy node scripts/check-integration-evidence.mjs docs/validation/unified-integration.evidence.json --require-complete
```

The first two commands exit 0. The strict acceptance command exits **1** with `Acceptance incomplete: every required case must pass`. Valid evidence is not the same as completed acceptance.

## Native results and support boundary

The current external consumer uses RN 0.85.1, React 19.2.3, MMKV 4.3.2, Nitro 0.35.10 and Clipboard 1.16.3, with the new architecture, iOS 15.1 minimum and Android minSdk 24. Its autolinking paths resolve inside its own `node_modules`. No parent Pods, source aliases or dependency hoisting were used.

The iOS workspace and scheme were verified as `Demo.xcworkspace` / `Demo`. The first Pod attempt failed on a Maven TLS download and a missing CMake executable in PATH. Using the already installed Android SDK CMake 3.22.1 in this command's PATH, the retry installed 79 Pods. A first Xcode attempt before successful Pods failed with missing xcconfig; the retry built successfully on Xcode 27.0 (27A266a), iOS 27 simulator SDK, arm64:

```sh
cd /tmp/toolkit-task14-integrated/ios
rtk proxy env PATH=<android-sdk>/cmake/3.22.1/bin:$PATH pod install
rtk proxy env PATH=<android-sdk>/cmake/3.22.1/bin:$PATH xcodebuild \
  -workspace Demo.xcworkspace -scheme Demo -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,id=<available-simulator>' \
  -derivedDataPath /tmp/toolkit-task14-integrated/acceptance-build/debug \
  PRODUCT_BUNDLE_IDENTIFIER=org.debugtoolkit.acceptance.current build
```

The built App ID is `org.debugtoolkit.acceptance.current`; its Debug dylib UUID is `64E4D280-04AB-3B61-81C7-A944CE1218FA`. Session ID and event marker remain null because this build was not installed or launched before the requested convergence. Available simulators alone do not prove an app run.

Android Debug and Release were attempted with the installed Zulu JDK 21.0.5, overriding the inherited invalid JAVA_HOME only for each command. Both stop before app compilation because Gradle 9.3.1 cannot resolve `org.gradle.toolchains.foojay-resolver-convention:0.5.0`. Android SDK platforms/build tools through 35 are present, while this RN template requests 36; that is an additional unresolved prerequisite. `adb devices` lists no attached device, and no AVD is configured. No global tool or system security setting was changed.

The minimum-version consumer was generated from RN 0.76.6 with CLI 15.0.1, rather than by changing the version in an RN 0.85 shell. The first `npx` invocation hit npm 11's `EALLOWSCRIPTS` propagation; invoking the downloaded CLI directly generated a clean shell. Its tarball installation and TypeScript check then passed. However, its actual `react-native config` contains:

```text
react-native-debug-toolkit: both native platforms; android=present
react-native-mmkv: MISSING NATIVE PLATFORM; android=null
react-native-nitro-modules: both native platforms; android=present
```

The native-dependency assertion exits 1. **RN 0.76.6 with this default CLI 15 consumer has not met the required integration contract.** Neither minimum-version native build was run. The package's existing candidate range remains unchanged in this validation-only task; resolving the missing Android autolink or narrowing and revalidating the declared lower endpoint is an open release requirement. A passing RN 0.85.1 iOS build does not validate Android or every version in the range.

## Release and current-session matrix

| Scenario | Automated evidence | Required device result |
| --- | --- | --- |
| Default Release | Native build-mode gates and disabled actions/storage have passing mocked tests | not_run: no installed Release app or observed absence of panel/side effects |
| Release with enabled:true | Local pages and no automatic discovery/upload pass mocked host/Hub tests | not_run: no device observation or manual send |
| Zero business config | All twelve renderer pages, empty business states and capability errors pass | not_run: no current device Console/HTTP capture |
| Showcase | Real HTTP 409/201 responses and renderer state/track/navigation/copy flow pass | not_run: full device flow was not exercised |
| History off/on | Zero log-disk access and prior-history restoration pass tests | not_run: no native restart/persistence observation |
| Unmount/Fast Refresh | Owner, cancellation and renderer remount cases pass | not_run: no actual Fast Refresh marker count |

No ATS/cleartext exception was added to get a build through. The inherited Demo iOS plist still has `NSAllowsLocalNetworking=true` without a Debug-only split; this run did not change or validate that policy in Release. The Android manifest uses the template's `usesCleartextTraffic` placeholder. Release network-policy acceptance remains open.

The packaged CLI's `diagnose --json` returned `LOCAL_HUB_NOT_RUNNING`. No historical Session or server `/ready` response was used as app evidence. App/Session/build matching and current marker receipt remain unperformed.

## Independent documentation-only acceptance

A fresh agent received only a new `--mode blank` consumer, its installed public README/docs and the requested integration task. It did not inherit this plan or reports, inspect SDK implementation files, reuse a connected Demo entry, or load an integration Skill. It applied one module-scope `withDebugToolkit(App)` wrapper, preserved `Consumer app` and AppRegistry registration, and left all business configuration absent.

Its patch adds a readiness-gated Console marker and a real HTTPS request attempt to `example.com`. The prepared marker is `task14-ai-blank-1790088862278-2ba9a7bcc577d`; it was **not observed in a running App**. Its offline install, types, one renderer test and native metadata checks passed. A second pass through the same docs kept one host and one registration and made no source change. This task independently reran the AI fixture's typecheck and renderer test successfully.

The agent's Pods attempts failed on Hermes TLS download, then CMake missing from its PATH. It obtained no native app build or current Session. Those are environment/unfinished-execution gaps, not proof of a documentation or SDK runtime failure. Its original detailed command output is in the agent's tool transcript; its retained report lists the commands/exits. The parent verification logs supplement the type/test results.

The [AI patch](ai-document-only.patch) is preserved with this report. Detailed artifacts remain at `/tmp/toolkit-task14-ai-blank/acceptance/report.md` and `/tmp/toolkit-task14-ai-blank/acceptance/integration.patch`. Its initial hand-written patch was replaced with a valid unified diff. A forward dry-run against the agent's acceptance directory failed because no baseline App file was retained there; this task then verified the patch against the actual changed App with a successful reverse dry-run (no file changed). The structured evidence records these exits, every public document read and the second-pass checks. The static documentation exercise passed; end-to-end AI device acceptance did not run.

## Reproduction and retained evidence

Raw command logs are retained in `.superpowers/sdd/2026-09-22-unified-integration-api/task-14-*`; each exact log name is listed in the JSON. The current, minimum and AI fixtures remain outside the repository at `/tmp/toolkit-task14-integrated`, `/tmp/toolkit-task14-minimum-v2` and `/tmp/toolkit-task14-ai-blank`. The tarball is retained at `/tmp/toolkit-task14-pack-zerDva/react-native-debug-toolkit-5.0.0.tgz`. These local artifacts are temporary; this committed report and JSON preserve their results and the material failure excerpts.

To continue, resolve the lower-end Android autolink and current Gradle/toolchain prerequisites, rebuild the appropriate fixture, then install and perform the remaining device rows with a new marker. Repeat the blank documentation-only trial on a new fixture after any documentation/API fix. Do not reuse this run's prepared marker as future event evidence.
