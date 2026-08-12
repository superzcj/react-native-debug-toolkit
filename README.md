# React Native Debug Toolkit

AI-first runtime diagnostics for React Native. Apps send debug evidence to one Shared Log Hub; repository AI reads it through a checked-in Skill and CLI. The Web Console is a human aid for browsing the same evidence.

## What is included

- In-app Toolkit: Console, Network, Native, Navigation, Track, Zustand, Environment, Clipboard, and custom tabs.
- Shared Log Hub: one trusted-LAN Node service with a Web Console and 7-day / 20 GB retention.
- AI workflow: repository Skill → `status`, `context`, `inspect`, and bounded `tail` commands. No MCP setup.

## 1. Install the App package

```bash
npm install react-native-debug-toolkit
cd ios && pod install
```

Expo Go cannot load the native module. Use a development build, prebuild, or bare React Native.

## 2. Install the Shared Hub once

Run this on the Mac mini that owns the fixed company-LAN address:

```bash
npm exec --yes --package=react-native-debug-toolkit@4.0.0 -- \
  debug-toolkit hub install --system \
  --bind 10.20.4.10 \
  --advertise-url http://10.20.4.10:3800
```

The system service starts again after restart, stores data in `/Users/Shared/ReactNativeDebugToolkitHub/data`, keeps logs for seven days, and refuses new events when it reaches 20 GB. Keep it on a trusted LAN or VPN; this first version has no authentication, TLS, or redaction.

Use `--dry-run` to inspect the installation without writing files:

```bash
debug-toolkit hub install --system --dry-run \
  --bind 10.20.4.10 --advertise-url http://10.20.4.10:3800
```

For local Hub development, run it in the foreground:

```bash
debug-toolkit hub start \
  --bind 10.20.4.10 --port 3800 \
  --data-dir /tmp/react-native-debug-toolkit-hub
```

## 3. Configure the App

Reuse `DebugView.features.devConnect`; `appId` should be the App's existing fixed identifier. Use the Mac's LAN IP for both simulators and devices. Do not use `127.0.0.1` on a device.

```tsx
import { DebugView } from 'react-native-debug-toolkit';

<DebugView
  enabled={__DEV__ || appConfig.buildChannel === 'internal'}
  features={{
    console: true,
    network: true,
    devConnect: {
      appId: appConfig.appId,
      endpoint: 'http://10.20.4.10:3800',
    },
  }}
>
  <AppContent />
</DebugView>
```

The Connect tab contains one Hub address input and two actions: **Upload Once** and **Start/Stop Live Logs**.

- Debug builds connect and upload live logs automatically.
- Internal/release builds that explicitly enable the Toolkit do not upload until the user chooses **Upload Once** or **Start Live Logs**.
- Public production builds should set `enabled={false}`. They do not collect, connect, or show Toolkit UI.

For bare React Native, put iOS Local Network / ATS and Android cleartext exceptions only in debug or internal build variants. The phone must be able to open the Hub address on the same LAN.

## 4. Let repository AI read evidence

Generate and commit the Skill from the App workspace:

```bash
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit init-skill
```

When a runtime problem is reported, the Skill finds the `DebugView` configuration, then uses `status → context → inspect`. With one active session it reads automatically; with multiple sessions it shows the device labels and asks the user to choose once.

The AI process must run in a local shell that can reach the Hub through the company LAN or VPN.

Manual read-only commands use explicit values:

```bash
debug-toolkit status --endpoint http://10.20.4.10:3800 --app-id com.example.app
debug-toolkit context --endpoint http://10.20.4.10:3800 --app-id com.example.app --session <session-id>
debug-toolkit inspect <entry-id> --endpoint http://10.20.4.10:3800 --app-id com.example.app
```

## Web Console

Open `http://10.20.4.10:3800/console`. It supports App selection, device/session selection, type and severity filters, keyword search, event details, and live refresh. It is a human troubleshooting aid; AI should use the Skill and CLI.

## Native logs

Native logs are captured with the rest of the Toolkit evidence:

- Android: current app-process `logcat` entries visible to the app.
- iOS: React Native native logs emitted through `RCTLog*`.

They can contain user data, tokens, URLs, or device state. Do not enable the Toolkit by default in public production builds.

## Other Toolkit options

`DebugView` also supports navigation tracking, Zustand middleware, Track events, runtime environment switching, Clipboard, and custom debug tabs. See the TypeScript exports for the available feature factories and types.

## Limits

- Debug evidence tool, not production monitoring or a React Native DevTools replacement.
- No default redaction.
- Network capture observes traffic; it does not diagnose business errors or authentication automatically.

## License

MIT
