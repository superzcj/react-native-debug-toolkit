# Configuration & troubleshooting

[Quick start](../README.md) · [中文](setup.zh-CN.md) · [Demo](../Demo/README.md)

## Native setup

- Install `react-native-debug-toolkit`; run `pod install` on iOS and rebuild.
- Use bare React Native or an Expo development build. The toolkit owns its MMKV store; no app storage adapter is needed.
- Debug/internal builds must allow HTTP access to the Hub: check iOS ATS/Local Network permissions and Android cleartext settings.

## Connection and build modes

```tsx
<DebugView
  enabled={__DEV__ || appConfig.buildChannel === 'internal'}
  features={{ devConnect: {
    appId: appConfig.appId,
    endpoint: appConfig.debugLogHubUrl,
  } }}
>
  <AppContent />
</DebugView>
```

Use your own build configuration and root component. `endpoint` is optional: Debug discovers the Hub via Metro, with the configured endpoint as fallback; Release uses it as the default address.

| Build | Behavior |
| --- | --- |
| Debug | Enabled by default; with `devConnect.appId`, discovers and uploads automatically |
| Internal / Release | Explicitly enable, then select **Upload Once** or **Start Live Logs** in Connect |
| Public production | Set `enabled={false}` |

Connect accepts an IPv4 prefix, last octet and port. Physical devices need the computer's LAN IP, not `127.0.0.1`. Valid manual addresses are retained. `hub dev` also attempts Android port forwarding with `adb reverse`.

## AI Skill and CLI

Run from the app root; keep the Hub running in another terminal:

```sh
npx --package=react-native-debug-toolkit debug-toolkit init
npx --package=react-native-debug-toolkit debug-toolkit diagnose --json
```

`init` creates `.agents/skills/react-native-debug-toolkit/SKILL.md` and updates `AGENTS.md`; commit both. Your AI tool must load the instructions and reach the local Hub. The toolkit itself does not call an AI API.

| Command | Purpose |
| --- | --- |
| `init --check` / `init --update` | Check or update the managed Skill; updates preserve a backup |
| `diagnose --json` | Discover the Hub and runtime evidence; choose a target if ambiguous |
| `status` / `context` / `inspect` / `tail` | Query targets, summaries, records or live events |

## No logs?

1. Check `http://127.0.0.1:3800/ready` on the computer and verify the App can reach the Hub.
2. Check `enabled`, `devConnect.appId` and the Connect address. Release requires manual upload.
3. Reproduce after Toolkit initialization; select the current app/session in Hub.
4. For empty response bodies or native logs, check the [capture limits](usage.md).

## Data

Hub stores logs in `.debug-toolkit/hub`, with seven-day / 20 GB retention limits. Use a trusted local network; logs are not automatically redacted. Logs shared with an AI provider follow that provider's data policies. Stop the foreground Hub with Ctrl+C.
