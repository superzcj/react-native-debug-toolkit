# Integrate an existing React Native app

[中文](integration.zh-CN.md) · [All configuration fields](configuration.md) · [Complete example](examples/integration/App.tsx)

This guide is for humans and AI coding assistants using version 5. Read this file, then configuration.md and the included examples when binding business data. No integration Skill, source-code inspection, special AI product or new setup CLI is required.

## 1. Find the existing root

Inspect package.json, the app's entry file (often index.js) and the component registered with AppRegistry. Preserve the registered app name and existing navigation, Providers, props and wrappers. If a toolkit wrapper already exists, update that location; do not add a second host. Define the HOC at module scope, never inside render. This major version does not retain legacy initialization APIs.

Current validation scope:

| Entry / platform | Evidence and boundary |
| --- | --- |
| React Native CLI, npm, RN 0.85.1, new architecture | Clean packaged-consumer install, TypeScript, renderer and native autolinking verified; iOS Pod installation verified. Native Debug/Release builds and device acceptance still require separate verification. |
| RN 0.76.6 through 0.85.1 | Declared candidate peer range; root JS/type tests use 0.76.6. This is not proof that every version or either endpoint has passed native builds. |
| Expo Go | Unsupported: required custom native modules are absent. |
| Expo development builds / Router / other entries / legacy architecture | Not verified by this delivery; no automatic migration recipe is provided. |

The candidate native baseline is iOS 15.1 / Android minSdk 24. Keep your existing app's stricter platform and Node requirements (the RN 0.85.1 Demo requires Node >=22.11); the Toolkit CLI itself requires Node >=20.

## 2. Install packages and rebuild native code

From your app project, using its npm lockfile:

```sh
npm install react-native-debug-toolkit@5 react-native-mmkv@4.3.2 react-native-nitro-modules@0.35.10 @react-native-clipboard/clipboard@1.16.3
cd ios
pod install
cd ..
```

Toolkit uses MMKV 4.3.2; Nitro 0.35.10 is required. Declare both in the app so native autolinking sees them. Clipboard is optional at runtime; the command includes it for phone copying. Without that native capability, phone copy reports unavailable while Console/Hub paths remain usable. Turning History off does not remove the MMKV native dependency. Use standard autolinking, not links to this repository.

After changing native dependencies, run your app's existing iOS/Android build command (commonly `npm run ios` or `npm run android`). Metro reload alone is insufficient. Pod install and autolinking output prove configuration, not a successful native build.

## 3. Wrap the root once

An ordinary App.tsx before integration:

```tsx
import React from 'react';
import { Text } from 'react-native';

export default function App() {
  return <Text>My App</Text>;
}
```

The complete App.tsx after integration:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';

function App() {
  return <Text>My App</Text>;
}
export default withDebugToolkit(App);
```

Keep the existing index.js registration, for example:

```js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

One line wraps the app after package installation and native build. It registers all twelve pages: Network, Console, Native, State, Navigation, Track, Connect, Clipboard, History, Environment, Accounts and Custom. Missing state sources, accounts, environments, refs or custom components yield normal empty pages. Do not invent business data to make them look populated.

For real business bindings, copy the self-contained [App.tsx](examples/integration/App.tsx), [debug.config.tsx](examples/integration/debug.config.tsx), [source.ts](examples/integration/source.ts) and [Verification.tsx](examples/integration/Verification.tsx) into one folder. They demonstrate a local demo identity (not remote authentication), one shared external store, an App-internal Context Provider, a source-backed custom component and real request verification. Replace the demo switch operation with your authentication flow. Configuration is explicitly imported, never automatically discovered.

## 4. Start the existing Hub and verify this run

In another terminal at the app root:

```sh
npx --package=react-native-debug-toolkit@5 debug-toolkit hub dev
```

Open http://127.0.0.1:3800 on the computer. Debug uses the native application identifier by default. Connect address precedence is saved manual address > config endpoint > Debug discovery through Metro/platform candidates. An unreachable explicit address reports failure instead of silently switching Hubs. Clear the saved manual address to return to config/discovery. Devices need the computer's reachable LAN address; localhost on a phone is the phone. The CLI also attempts Android adb reverse.

Open the floating inspector, verify all twelve pages, then generate a NEW Console marker and real HTTP request after capture is ready. The included Verification component waits for debug.ready(), accepts your reachable non-mutating health/test URL, emits a unique integration-timestamp-random marker and adds it to the request query. Use an endpoint without a URL fragment. It shows the actual HTTP status or failure; it does not fabricate a successful response.

In the Hub, select the current App and Session and search for that marker in Console and Network. Check the request URL and real response. Record appId, sessionId, platform/build identity and marker. If zero config cannot obtain a native identity, keep the local inspector and supply a stable connect.appId using the config reference.

```sh
npx --package=react-native-debug-toolkit@5 debug-toolkit diagnose --json
npx --package=react-native-debug-toolkit@5 debug-toolkit status
```

Existing context/inspect/tail commands can inspect evidence; use `debug-toolkit <command> --help` for target flags. Hub /ready proves only that the server is ready. Old sessions or old logs do not prove the current app integration works. Report dependency/static checks, native build, current panel and current-session event receipt separately.

## 5. Initialization, Release and troubleshooting

debug.ready() describes local initialization and each feature's capability. Wait inside a normal useEffect or a user action after mount; do not wait at module scope, render or an earlier child layout effect. Before a host mounts it returns not_started; disabled returns disabled; unmount cancels pending work; initialization is bounded by 10 seconds. No Hub connection is required for local readiness. Empty is normal; unavailable/error includes a reason. Recording before readiness is a no-op, and earlier startup traffic is not replayed.

Release is disabled by default. If an internal Release build explicitly sets enabled: true, Connect still does not discover or upload automatically: use Upload Once or Start Live Logs. Set enabled: false for a build where the toolkit must not run. This runtime option does not remove native code from the binary.

If the launcher is absent, inspect build mode and enabled. If a page is empty, verify its actual business binding or generate an event. If it reports an error, fix the displayed field path/capability. Native module errors require checking installation/autolinking and rebuilding. Hub problems require device-to-computer reachability and any applicable HTTP/ATS/local-network permissions; preserve the app's security policy. [Setup and CLI details](setup.md) and [field reference](configuration.md) cover follow-up work.

AI handoff: read the installed package's README and docs/integration.md, find the existing registration, apply one module-scope wrapper, preserve business structure, add only real data sources, build, then produce a fresh marker/request and report the four verification layers above. Use matching version docs from node_modules/react-native-debug-toolkit. Do not require internal implementation files or install an integration Skill.

