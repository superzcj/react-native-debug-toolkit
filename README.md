# React Native Debug Toolkit

A complete in-app inspector and local runtime log Hub for React Native.

[中文](README.zh-CN.md) · [Integration](docs/integration.md) · [Configuration](docs/configuration.md) · [Demo](https://github.com/superzcj/react-native-debug-toolkit/blob/main/Demo/README.md)

## One root wrapper, all features

Install the package and native dependencies in your existing React Native CLI app:

```sh
npm install react-native-debug-toolkit@5 react-native-mmkv@4.3.2 react-native-nitro-modules@0.35.10 @react-native-clipboard/clipboard@1.16.3
cd ios
pod install
cd ..
```

A complete App.tsx (apply the final wrapper to your existing root):

```tsx
import React from 'react';
import { Text } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';

function App() {
  return <Text>My App</Text>;
}
export default withDebugToolkit(App);
```

Rebuild using your existing iOS/Android command. Installation, Pods and native rebuild are still required; “one line” describes the wrapper. Define it at module scope, preserve AppRegistry and mount one host.

| Default pages | Without business configuration |
| --- | --- |
| Network / Console / Native | Supported events after initialization; actual native capability status |
| State / Navigation / Track | Normal empty pages until sources, refs or explicit events supply data |
| Connect | Native app identity and Debug discovery; local pages work without Hub |
| Clipboard | User-triggered text actions; optional native clipboard affects phone copy only |
| History | Retained Network/Console/Native/Track logs, if any |
| Environment / Accounts / Custom | Normal empty pages until real data/components are supplied |

This is the complete toolkit. No feature registration list or twelve enabled flags is needed. Supply objects such as `withDebugToolkit(App, { locale: 'zh-CN', network: { maxLogs: 100 } })`. Explicit `{ enabled: false }` closes a feature. [All fields and a runnable source/Context/account example](docs/configuration.md).

## Connect and verify

From the app root:

```sh
npx --package=react-native-debug-toolkit@5 debug-toolkit hub dev
```

Open [the local Hub](http://127.0.0.1:3800/). Debug can discover/upload automatically; a phone needs a reachable computer address. After ready, generate a fresh unique Console marker and real HTTP request, then locate both in the **current App and Session**. [Exact verification steps](docs/integration.md).

Release is disabled by default. An explicitly enabled internal Release still needs Upload Once/Start Live Logs; no automatic discovery/upload occurs. Events before initialization are not replayed. [Lifecycle, disk limits and per-channel copy results](docs/configuration.md).

## Let AI integrate the app

Give your assistant the installed package's [integration guide](docs/integration.md), [configuration reference](docs/configuration.md) and [complete examples](docs/examples/integration/App.tsx). Ask it to locate the root, wrap once, bind real business data, rebuild and verify a new current-session marker. No integration Skill or internal-source knowledge is needed.

Existing Hub/CLI commands diagnose --json, status, context, inspect and tail query runtime evidence. An optional existing diagnosis Skill can be managed with debug-toolkit init; this is separate from app integration. [CLI details](docs/setup.md).

## Demo and support

The [Demo](https://github.com/superzcj/react-native-debug-toolkit/blob/main/Demo/README.md) offers zero business configuration and a full Showcase: real HTTP 409/201, environments, state/analytics, local account identities and copy results.

RN CLI/npm is the verified entry. RN 0.85.1 clean package install, types, renderer, autolinking and Pod installation have been checked; native builds/device acceptance remain separate. RN 0.76.6–0.85.1 is a candidate dependency range, not native success across all versions. Expo Go is unsupported; other entries are unverified. [Support boundary](docs/integration.md).

The Hub runs locally without a cloud account. Logs are not automatically redacted; review before sharing. [MIT](LICENSE).
