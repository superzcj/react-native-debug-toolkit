# React Native Debug Toolkit

[中文](README.zh-CN.md)

Dev-only React Native inspector with a local log bridge.

It shows app logs on device, then can send the same session to a local daemon for browser, curl, scripts, or MCP.

## Model

```text
RN App logs -> Debug Panel -> local daemon -> Web Console / HTTP / MCP
```

Captured logs:

- Network
- Console
- Navigation
- Track
- Zustand

The daemon stores sessions in memory. Restarting it clears logs.

## Install

```bash
npm install react-native-debug-toolkit
```

Optional:

```bash
npm install @react-native-clipboard/clipboard
npm install @react-native-async-storage/async-storage
```

## App Usage

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

Open app in dev mode. Tap `DBG`.

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

## Desktop Logs

Start daemon:

```bash
npx debug-toolkit --daemon-only
```

Open:

```text
http://127.0.0.1:3799/console
```

In app: Debug Panel -> gear -> `Send Once` or `Start Live Sync`.

Endpoints:

| Runtime | Endpoint |
| --- | --- |
| iOS simulator | `http://localhost:3799` |
| Android emulator | `http://10.0.2.2:3799` |
| Real device | `http://<mac-ip>:3799` |

Real device rule: phone browser must open `http://<mac-ip>:3799/health`. If not, check firewall, Wi-Fi isolation, VPN, and cleartext HTTP.

## HTTP

```bash
curl http://127.0.0.1:3799/health
curl http://127.0.0.1:3799/sessions
curl http://127.0.0.1:3799/sessions/latest
curl 'http://127.0.0.1:3799/sessions/<sessionId>/logs?type=network&failedOnly=true&limit=50'
```

Main endpoints:

```text
GET    /health
POST   /report
POST   /ingest
GET    /sessions
GET    /sessions/latest
GET    /sessions/:sessionId/logs
DELETE /sessions
GET    /events
GET    /console
```

## MCP

```bash
claude mcp add debug-toolkit -- npx debug-toolkit
```

Tools:

- `list_app_sessions`
- `get_app_logs`

Use curl when shell is available.

## Exports

- `DebugView`
- `DebugToolkit`
- `initializeDebugToolkit`
- `createDebugSessionReport`
- `checkDaemonConnection`
- `reportDebugSessionToDaemon`
- `startStreaming`
- `stopStreaming`
- `isStreaming`
- `autoDetectDaemonIp`
- feature factories and types

## Boundaries

- Dev tool, not production monitoring.
- Local daemon, not cloud replay.
- Network logs are observed traffic, not auth/token analysis.
- No default redaction.
- Not a React Native DevTools replacement.

## License

MIT
