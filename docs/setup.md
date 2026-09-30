# Connection and troubleshooting

[Integration](integration.md) · [Configuration](configuration.md) · [中文](setup.zh-CN.md)

The [integration guide](integration.md) covers native installation, root registration and current-session verification. All SDK settings are now objects passed to withDebugToolkit.

## Build modes and addresses

| Build          | Behavior                                                                          |
| -------------- | --------------------------------------------------------------------------------- |
| Debug          | Enabled by default; native identity, automatic discovery/upload                   |
| Release        | Disabled by default; if explicitly enabled, manual Upload Once or Start Live Logs |
| enabled: false | No runtime collection/page; native dependencies remain                            |

Address precedence: saved manual address > connect.endpoint > Debug discovery. Unreachable explicit addresses do not silently fall back. Missing native identity makes Connect unavailable; supply connect.appId. Neither is mandatory when native identity/discovery works.

Connect accepts IPv4 prefix, last octet and port, retaining valid manual addresses. Devices need the computer LAN IP, not phone localhost. hub dev also attempts Android adb reverse. Check applicable iOS ATS/Local Network and Android cleartext settings for HTTP development networks, preserving your app's security policy.

## Existing Hub and CLI

Run from the app root:

```sh
npx --package=react-native-debug-toolkit@4.1.2 debug-toolkit hub dev
```

In another terminal:

```sh
npx --package=react-native-debug-toolkit@4.1.2 debug-toolkit diagnose --json
npx --package=react-native-debug-toolkit@4.1.2 debug-toolkit status
```

| Command                             | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| diagnose --json                     | Discover runtime evidence; choose the intended target if ambiguous |
| status / context / inspect / tail   | Query targets, summaries, records or live events                   |
| init / init --check / init --update | Optional existing runtime-diagnosis Skill; updates retain a backup |

## Minimal AI diagnosis example

From the app project root, start `hub dev`, reproduce the issue, and ask an AI coding assistant to run:

```sh
npx --package=react-native-debug-toolkit@4.1.2 debug-toolkit diagnose --json
```

The command reads runtime evidence and returns JSON. Follow `action.retryArgs` or the target-selection instructions when present. Once a target is selected, use `context`, `inspect <entryId>`, or `tail --duration-ms 10000` with that target to inspect the relevant logs. The first two return JSON; `tail` streams NDJSON.

For example, if no usable local Hub is found, the response contains these fields (other fields omitted):

```json
{
  "state": "action_required",
  "code": "LOCAL_HUB_NOT_RUNNING",
  "action": {
    "suggestedCommand": "npx --no-install debug-toolkit hub dev"
  }
}
```

Start the Hub from the app project, reproduce the issue, then retry diagnosis. `hub dev` creates or updates local Hub data; `init` writes the optional Skill and its `AGENTS.md` section.

Optional init creates .agents/skills/react-native-debug-toolkit/SKILL.md and updates AGENTS.md for runtime diagnosis. AI app integration reads public docs and does not require init. The toolkit does not call an AI API.

Hub language is independent of SDK locale:

```sh
npx --package=react-native-debug-toolkit@4.1.2 debug-toolkit hub dev --locale zh-CN
```

hub start supports the same flag. DEBUG_TOOLKIT_HUB_LOCALE also works; the flag wins. Hub auto uses browser language. Restart Hub and reload after changing configuration.

## No current logs?

1. Check http://127.0.0.1:3800/ready on the computer and ensure the app can reach it.
2. Check build mode/enabled, actual Connect identity and address. Release needs manual upload.
3. After ready, reproduce a new unique marker and real request; select the current App/Session.
4. Empty business data is normal; unavailable capability and error states explain the cause.
5. Check [capture limits](configuration.md). Old logs or Hub health alone cannot prove this run.

Hub stores data in .debug-toolkit/hub with seven-day / 20 GB retention. Logs are not automatically redacted. Stop foreground Hub with Ctrl+C.
