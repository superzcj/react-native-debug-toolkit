# React Native Debug Toolkit

**From an action in your app to the evidence behind it.**

[中文](README.zh-CN.md) · [Try the Demo](Demo/README.md) · [Setup guide](docs/setup.md) · [Feature examples](docs/usage.md)

A runtime debugging toolkit for React Native: inspect requests, logs and state in your app, follow device activity in a local browser console, and let your AI coding assistant investigate the same evidence alongside your code.

Reproduce on the phone. Inspect on the desktop. Ask your AI what happened.

<p align="center"><img src="demo.gif" width="380" alt="Reproduce a checkout failure, inspect its HTTP response, follow the cart state change, inspect analytics events, switch environments, and sync logs." /></p>

<p align="center"><sub>Requests, state, analytics events, environments, text sharing and log sync. About 18 seconds.</sub></p>

## Three ways to investigate

| Where you work | What it gives you |
| --- | --- |
| **Inside the app** | A floating inspector keeps requests, console output and state changes close to the action. Check a failure while reproducing it on a device. |
| **In your browser** | The local Hub collects device sessions. Search logs, expand request details and watch new events arrive while you operate the app. |
| **With your AI assistant** | A repository Skill and read-only CLI give your coding assistant runtime evidence to investigate alongside the source. Describe the symptom to start. |

No account or cloud log service required. The Hub runs on your computer; AI integration uses a repository Skill, with no MCP setup.

![Inspect synced logs, a Staging request, analytics properties and text sent from the phone](docs/media/hub.gif)

**Bring device information to your computer:** app activity flows into the Hub. For a diagnostic note, enter text in Clip and tap Copy; view and copy it in the browser Console.

## Built for everyday debugging

| Capability | What you can inspect or control |
| --- | --- |
| **Network** | Request status, timing, headers and request/response bodies |
| **Console & Native** | JS output and supported native logs in the same toolkit |
| **State** | Zustand actions and before/after values; explicit logging for other state systems |
| **Navigation** | Route transitions, previous/next routes and timing |
| **Track / Analytics** | Inspect instrumented event names, properties and timestamps to verify analytics tracking |
| **Custom tabs** | Your app's own live snapshots: a cart, feature flags or user context |
| **Environment switching** | Switch configured development/test API hosts or URL prefixes and retain the selection |
| **Phone → Mac text sharing** | Send text through Clip/Copy to Console; view and copy it in the Mac browser Hub |
| **Log sync** | Send network, JS/native logs, state, navigation and analytics events to the local Hub, once or continuously |
| **Test accounts / Sessions** | Integrate account switching and revisit retained logs |

Network and console capture start automatically after initialization. State, navigation, events and business tools use small integrations. [See the examples and capture limits →](docs/usage.md)

## Get started

### Add the in-app inspector

```sh
npm install react-native-debug-toolkit
cd ios && pod install
```

Wrap your existing root component and replace `appId` with your app's stable identifier:

```tsx
import { DebugView } from 'react-native-debug-toolkit';

export default function App() {
  return (
    <DebugView features={{ devConnect: { appId: 'com.example.myapp' } }}>
      <AppContent />
    </DebugView>
  );
}
```

Rebuild the native app, then tap the floating launcher. The in-app inspector also works without a Hub. Expo requires a development build; Expo Go is not supported.

The inspector supports English and Simplified Chinese. Set `<DebugView locale="zh-CN">` to use Chinese, or leave the default `auto` to detect the device language at startup. [Language configuration →](docs/usage.md#language)

### Connect your browser and AI

From your app project, start the Hub:

```sh
npx --package=react-native-debug-toolkit debug-toolkit hub dev
```

Open [localhost:3800](http://127.0.0.1:3800/). Debug builds discover the Hub through Metro and upload automatically. Physical devices need a reachable computer LAN address.

Install the AI Skill once:

```sh
npx --package=react-native-debug-toolkit debug-toolkit init
```

Commit the generated `.agents/skills/react-native-debug-toolkit/SKILL.md` and `AGENTS.md` changes. In a coding assistant that loads them and can reach the Hub, reproduce the issue and ask:

> Check why the checkout just failed. Use the runtime logs to locate the relevant code.

The toolkit provides the evidence; your AI assistant performs the analysis. [Connection, build modes and troubleshooting →](docs/setup.md)

## Try it with a real request

The [Demo](Demo/README.md) includes a local shop API. Trigger an inventory conflict, inspect the **HTTP 409 and JSON response**, follow the **state and analytics events**, switch to **Staging**, and watch **201 arrive in the Hub**. Use Clip to send a note to your computer. The data is synthetic; requests use the real React Native network stack.

Use in debug/internal builds. Release uploads require an explicit action in Connect; keep public production builds disabled. Run the Hub on a trusted network and review logs before sharing—they are not automatically redacted.

[MIT license](LICENSE)
