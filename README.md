# React Native Debug Toolkit

![demo](demo.gif)

[中文](README.zh-CN.md)

React Native Debug Toolkit is a dev-only local debugging toolkit for React Native apps.

Use it to inspect app logs on device, stream logs to a desktop Web Console, and let AI coding agents read real runtime evidence through HTTP or MCP.

```text
RN App -> Debug Panel -> local daemon -> Web Console / HTTP API / MCP
```

## What You Get

- In-app debug panel with Network, Console, Navigation, Track, Zustand, Environment, and Clipboard logs.
- Desktop Web Console for simulator and real-device logs.
- Local HTTP API for curl, scripts, Codex, Claude Code, and other AI agents with shell access.
- Optional MCP server with `list_app_devices` and `get_app_logs`.
- Local-first workflow. No cloud service. No AI API call inside the package.

## Install

```bash
npm install react-native-debug-toolkit
```

Install the native part and rebuild the app:

```bash
cd ios && pod install
# Android: Gradle autolinking runs on the next build
```

Expo Go cannot load this native module. Use a development build, prebuild, or bare React Native app.

Optional dependencies:

```bash
npm install @react-native-clipboard/clipboard
npm install @react-native-async-storage/async-storage
```

## Quick Start

Wrap your app:

```tsx
import { DebugView } from 'react-native-debug-toolkit';

export function App() {
  return (
    <DebugView>
      <AppContent />
    </DebugView>
  );
}
```

Run the app in dev mode, then tap `DBG`.

Start the desktop daemon:

```bash
npm exec -- debug-toolkit --daemon-only
# or: npx react-native-debug-toolkit --daemon-only
```

Open the Web Console:

```text
http://127.0.0.1:3799/console
```

In the app, open Debug Panel -> `DevConnect` -> `Send Once` or `Start Live Sync` for desktop logs.

DevConnect auto-detects simulator/emulator and uses local host settings automatically. On real devices, enter your computer IP to connect.

### Embedded Debug Bundle

Debug builds need an embedded JS bundle for cold start when Metro is off.

Bare React Native:

```bash
npm exec -- debug-toolkit setup-bundle
git diff
git commit -am "chore: enable debug bundle embedding"
```

By default, `setup-bundle` configures the native platforms present in the app directory. Use `--platform ios` or `--platform android` to force one platform.

Run this once from the app root after installing `react-native-debug-toolkit`, then commit the generated native project changes. Build machines should run normal install and build commands, not `setup-bundle`.

Expo dev-client:

```json
{
  "expo": {
    "plugins": [
      ["react-native-debug-toolkit/dev-client", { "embedBundle": true }]
    ]
  }
}
```

Verify built artifacts:

```bash
npm exec -- debug-toolkit doctor-bundle --platform ios --app path/to/App.app
npm exec -- debug-toolkit doctor-bundle --platform android --apk path/to/app-debug.apk
```

After setup, build machines run normal Xcode, Gradle, React Native, or EAS commands. Do not run a separate mutation command on every build.

For Remote JS Bundle, run Metro on your computer, enter computer IP and Metro port in `DevConnect`, then tap `Use Metro Bundle`. DevConnect persists the host and hot-reloads from Metro. Use **Reset** to go back to the embedded bundle.

> **Debug builds only.** Metro host switching works in Debug builds. Release builds load the embedded bundle and the controls are disabled (`release: disabled` badge).

**iOS — no AppDelegate changes required.** On install, DevConnect hooks `RCTBundleURLProvider` so the app **cold-starts from the embedded `main.jsbundle`** and only connects to Metro after you apply a host in the panel (fixes Expo `.expo/.virtual-metro-entry` red screens when Metro is off).

The IP and ports are persisted through AsyncStorage when installed, or through the native module after rebuild.

QR scan is optional. Install `react-native-camera-kit` or `expo-camera` in the app to enable the scan button. The app must request camera permission before scanning.

## Device Setup

| Runtime | App endpoint |
| --- | --- |
| iOS simulator | `http://localhost:3799` |
| Android emulator | `http://10.0.2.2:3799` |
| Real device | `http://<mac-ip>:3799` |

For a real device, first open this URL in the phone browser:

```text
http://<mac-ip>:3799/health
```

If it does not open, check Mac firewall, Wi-Fi isolation, VPN, local network permission, and cleartext HTTP settings.

The daemon stores logs at:

```text
~/.react-native-debug-toolkit/daemon-devices.json
```

Custom store path:

```bash
npm exec -- debug-toolkit --daemon-only --store /path/to/devices.json
# or: npx react-native-debug-toolkit --daemon-only --store /path/to/devices.json
DEBUG_TOOLKIT_DAEMON_STORE=/path/to/devices.json npm exec -- debug-toolkit --daemon-only
```

## Read Logs With HTTP

HTTP is the best path when your AI agent or script has shell access.

```bash
BASE=http://127.0.0.1:3799

curl "$BASE/health"
curl "$BASE/devices"
curl "$BASE/devices/latest"

DEVICE_ID=$(curl -s "$BASE/devices" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log((JSON.parse(s).devices||[])[0]?.deviceId||''))")

curl "$BASE/devices/$DEVICE_ID/logs?limit=100"
curl "$BASE/devices/$DEVICE_ID/logs?type=network&failedOnly=true&limit=50"
curl "$BASE/devices/$DEVICE_ID/logs?type=console&limit=100"
curl "$BASE/devices/$DEVICE_ID/logs?entryId=<entryId>"
curl "$BASE/devices/$DEVICE_ID/logs?limit=100&includeBodies=true"
curl -X DELETE "$BASE/devices"
```

Main endpoints:

```text
GET    /health
POST   /report
POST   /ingest
GET    /devices
GET    /devices/latest
GET    /devices/:deviceId
GET    /devices/:deviceId/logs?type=&limit=&failedOnly=&includeBodies=&entryId=
DELETE /devices
GET    /events
GET    /console
```

## Use MCP

```bash
claude mcp add debug-toolkit -- npm exec -- debug-toolkit
# or: claude mcp add debug-toolkit -- npx react-native-debug-toolkit
```

Tools:

- `list_app_devices`
- `get_app_logs`

`get_app_logs` excludes bodies by default to reduce tokens. Set `includeBodies=true` or pass `entryId` to fetch one full log entry.

## App Options

Disable features:

```tsx
<DebugView features={{ clipboard: false, zustand: false }}>
  <AppContent />
</DebugView>
```

Navigation tracking:

```tsx
<DebugView navigationRef={navigationRef}>
  <NavigationContainer ref={navigationRef}>
    <AppContent />
  </NavigationContainer>
</DebugView>
```

Zustand:

```tsx
import { zustandLogMiddleware } from 'react-native-debug-toolkit';
```

Track:

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({ eventName: 'button_click' });
```

## Exports

- `DebugView`
- `DebugToolkit`
- `initializeDebugToolkit`
- `createDebugDeviceReport`
- `checkDaemonConnection`
- `reportDebugDeviceToDaemon`
- `startStreaming`
- `stopStreaming`
- `isStreaming`
- `autoDetectDaemonIp`
- feature factories and types

## Limits

- Dev tool, not production monitoring.
- Local daemon, not cloud replay.
- Network capture observes traffic; it does not analyze auth, tokens, or business errors.
- No default redaction.
- Not a React Native DevTools replacement.

## License

MIT
