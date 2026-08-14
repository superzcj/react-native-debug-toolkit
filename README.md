# React Native Debug Toolkit

React Native runtime logs for debugging with AI. Run a Hub on your Mac, let the App send logs to it, and let AI read them through a Skill in the repository. The Hub web page is a supporting view for humans.

[中文说明](README.zh-CN.md)

## Pick a command

| Situation                                 | Run from        | Command                         |
| ----------------------------------------- | --------------- | ------------------------------- |
| Debug an App on your own Mac (usual)      | that App's root | `npx --package=react-native-debug-toolkit debug-toolkit hub dev` |
| Work on this repository and start the Hub | repository root | `npm run hub`                   |
| Run the Demo on iOS                       | repository root | `npm run demo:ios`              |
| Run the Demo on Android                   | repository root | `npm run demo:android`          |
| Set up AI for this repository             | repository root | `npm run ai:init`               |
| Set up AI for an App repository           | that App's root | `npx --package=react-native-debug-toolkit debug-toolkit init` |

The `npm run` commands above are scripts in this repository's `package.json`. They are only for this checkout. `react-native-debug-toolkit` is the npm package and `debug-toolkit` is its bin, so use `npx --package=react-native-debug-toolkit debug-toolkit ...` in an App repository.

## Run a Hub on your Mac

This is the normal way to debug an App. Run it from the App repository:

```bash
npx --package=react-native-debug-toolkit debug-toolkit hub dev
```

It runs in the foreground on port `3800` and stores data in `.debug-toolkit/hub`. It prints loopback and LAN addresses. Debug Apps can discover the Hub from the Metro bundle host; `features.devConnect.endpoint` is optional — used as the Release default and the Debug fallback when auto-discovery fails.

Stop the Hub with `Ctrl+C` when you are done. When an Android device or emulator is present, `hub dev` tries `adb reverse tcp:3800 tcp:3800` and continues even if that fails.

If a team runs the same command on another always-on machine, Apps can connect through `endpoint`. Process supervision, auto-start, upgrades, and network hardening are outside the Toolkit.

## Test this repository

Open two terminals in the repository root:

```bash
npm run hub
```

```bash
npm run demo:ios
# or: npm run demo:android
```

The Hub listens on port `3800` and keeps its data in `.debug-toolkit/hub`. Open the printed LAN address in a browser, use the Demo, and check that a device and its events appear.

A physical device must reach the Hub over the LAN — do not use `127.0.0.1` for that device.

For the exact Demo checks, see [Demo/README.md](Demo/README.md).

## Add the Toolkit to an App

```bash
npm install react-native-debug-toolkit
cd ios && pod install
```

Expo Go cannot load the native module. Use a development build, prebuild, or bare React Native.

Configure the App with its existing identifier. Debug builds can omit `endpoint` and auto-discover the Hub. Release or internal builds that enable Toolkit may set `endpoint`, or let the user type a reachable Hub address in the Connect tab:

```tsx
import { DebugView } from "react-native-debug-toolkit";

<DebugView
  enabled={__DEV__ || appConfig.buildChannel === "internal"}
  features={{
    console: true,
    network: true,
    devConnect: {
      appId: appConfig.appId,
      endpoint: appConfig.debugLogHubUrl,
    },
  }}
>
  <AppContent />
</DebugView>;
```

Toolkit owns an isolated `react-native-debug-toolkit` MMKV store for logs,
Toolkit UI preferences, and built-in feature state. No App storage adapter is
required.

The Connect tab has an address field, **Upload Once**, and **Start/Stop Live Logs**. On a physical device it first suggests the detected LAN prefix, such as `192.168.1.`, so you can fill only the computer IP suffix. When `endpoint` is configured it appears as the second recommendation. A valid manual address is retained by the Toolkit; clearing it returns to the configured endpoint or an empty field.

- Debug builds resolve a Hub, connect, and upload as soon as the Toolkit starts.
- Internal or release builds upload only after the user selects **Upload Once** or **Start Live Logs**.
- Public production builds use `enabled={false}`. They do not show the Toolkit or send logs.

For a bare React Native App, allow access to the internal HTTP Hub only in debug/internal configurations: iOS needs the relevant ATS and Local Network settings; Android needs its cleartext setting. A physical device must be able to reach the Hub over the LAN.

To update the package, install the version you want and rebuild the native App:

```bash
npm install react-native-debug-toolkit@<version>
cd ios && pod install
```

## Let AI read runtime logs

At the root of an App repository, run once:

```bash
npx --package=react-native-debug-toolkit debug-toolkit init
```

The command creates `.agents/skills/react-native-debug-toolkit/SKILL.md` and adds its discovery instruction to `AGENTS.md`. Commit both files.

Then describe the problem normally, for example:

```text
Why did the login request fail just now?
```

The Skill reads the App's `devConnect` configuration, finds the session, and reads the relevant logs. If more than one device is active, AI asks which device to use. Run AI on the same Mac as the local Hub (it prefers `http://127.0.0.1:3800`).

`status`, `context`, `inspect`, and `tail` remain available when someone needs to query the Hub manually.

## Hub web page

Open the Hub address in a browser, for example `http://127.0.0.1:3800/` or the printed LAN URL. Select the App and device, then filter or inspect the events. It is a supporting view for human debugging; the Skill is the AI entry point.

## Included features

- App Toolkit: Console, Network, Native, Navigation, Track, Zustand, Environment, Clipboard, and custom tabs.
- Hub: a Node service, JSONL storage, and the web page. Logs are kept for seven days, up to 20 GB.
- AI access: a repository Skill and read-only CLI. MCP is not required.

## Limits

- This is a debugging tool, not production monitoring or a React Native DevTools replacement.
- It does not redact data by default.
- Network capture records requests. It cannot determine a business or authentication failure on its own.
- First release keeps Hub on trusted developer machines or LANs. Do not expose it to the public Internet.

## License

MIT
