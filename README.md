# React Native Debug Toolkit

![demo](demo.gif)

[中文](README.zh-CN.md)

A local debugging toolkit for React Native apps. It provides an in-app debug panel, a desktop Web Console, an HTTP API, and an MCP server — all running locally with no cloud dependency.

```text
RN App -> Debug Panel -> local daemon -> Web Console / HTTP API / MCP
```

## Features

- In-app debug panel: Network, Console, Native, Navigation, Track, Zustand, Environment, Clipboard, and custom tabs.
- Desktop Web Console for viewing simulator and real-device logs in a browser.
- Local HTTP API for reading logs with `curl`, scripts, or AI agents (Codex, Claude Code, etc.).
- Optional MCP server exposing `list_app_devices` and `get_app_logs`.
- Local-first: no cloud service, no signup, no AI API calls inside the package.

## Install

```bash
npm install react-native-debug-toolkit
```

Install the native part and rebuild:

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

In the app, go to Debug Panel → `DevConnect` → `Send Once` or `Start Live Sync` to sync logs to the desktop.

DevConnect auto-detects simulator/emulator and configures host settings. On real devices, enter your computer IP manually.

IP and ports are persisted via AsyncStorage (when installed) or through the native module after rebuild.

QR scan is optional. Install `react-native-camera-kit` or `expo-camera` to enable the scan button. The app must request camera permission before scanning.

## Device Setup

| Runtime | App endpoint |
| --- | --- |
| iOS simulator | `http://localhost:3799` |
| Android emulator | `http://10.0.2.2:3799` |
| Real device | `http://<mac-ip>:3799` |

For real devices, first open this URL in the phone browser:

```text
http://<mac-ip>:3799/health
```

If it does not open, check Mac firewall, Wi-Fi isolation, VPN, local network permission, and cleartext HTTP settings.

Daemon log store:

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

HTTP is the recommended path when your AI agent or script has shell access.

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

Endpoints:

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

- `list_app_devices` — list connected devices
- `get_app_logs` — fetch device logs

`get_app_logs` excludes bodies by default to reduce token usage. Set `includeBodies=true` or pass `entryId` to fetch a single full entry.

## Native Logs

Native Logs collects native app-process logs and displays them in the `Native` tab.

- Android: captures current app-process `logcat` entries visible to the app.
- iOS: captures React Native native logs emitted through `RCTLog*`.
- DevConnect sends Native logs to the desktop daemon with the rest of the current session.

Release builds stay disabled by default. To enable for internal release, TestFlight, QA, or gray rollout builds:

```tsx
<DebugView enabled={true} />
```

Native logs may contain user data, tokens, URLs, or device state. Do not enable by default in public production builds.

## App Options

### Disable features

```tsx
<DebugView features={{ clipboard: false, zustand: false }}>
  <AppContent />
</DebugView>
```

### Custom tabs

```tsx
import {
  DebugView,
  createDebugTab,
  type DebugFeatureRenderProps,
} from 'react-native-debug-toolkit';

type UserSnapshot = {
  id?: string;
  role?: string;
};

function UserDebugTab({ snapshot }: DebugFeatureRenderProps<UserSnapshot>) {
  return (
    <View>
      <Text>User ID: {snapshot.id ?? '-'}</Text>
      <Text>Role: {snapshot.role ?? '-'}</Text>
    </View>
  );
}

const userDebugTab = createDebugTab<UserSnapshot>({
  name: 'user',
  label: 'User',
  getSnapshot: () => ({
    id: authStore.user?.id,
    role: authStore.user?.role,
  }),
  render: UserDebugTab,
});

<DebugView customFeatures={[userDebugTab]}>
  <AppContent />
</DebugView>;
```

Each custom feature becomes a panel tab. `name` is the stable tab id, `label` is shown in the tab bar, `getSnapshot` provides tab data, and `render` controls the UI. Add `subscribe` when the tab should refresh after external state changes.

### Navigation tracking

```tsx
<DebugView navigationRef={navigationRef}>
  <NavigationContainer ref={navigationRef}>
    <AppContent />
  </NavigationContainer>
</DebugView>
```

### Zustand

```tsx
import { zustandLogMiddleware } from 'react-native-debug-toolkit';
```

### Track events

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({ eventName: 'button_click' });
```

## Exports

- `DebugView`
- `DebugToolkit`
- `initializeDebugToolkit`
- `createDebugTab`
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
