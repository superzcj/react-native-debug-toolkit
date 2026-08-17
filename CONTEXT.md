# Domain Glossary

## Core concepts

- **Feature** — An in-app debug capability such as Network, Console, Native, Navigation, Track, Zustand, Environment, or Clipboard.
- **FeatureDataProvider** — The Toolkit feature registry exposed to `HubClient` for snapshots and change notifications.
- **HubClient** — The one App-side transport. It opens the current runtime Session, batches events, and retries in memory with sequence/ACK protection.
- **Session** — One App runtime connected to a Hub.
- **Event** — A normalized debug record with a sequence number.
- **Hub** — The local HTTP process that persists sessions, exposes CLI APIs, and serves the human Web Console. Developers usually run it on their own Mac with `hub dev`.

## Architecture

- **Feature Registry** (`DebugToolkit`) manages feature setup, cleanup, snapshots, and subscriptions.
- **Feature Factories** create independent Toolkit features such as `createNetworkFeature`.
- **HubClient** consumes the feature registry through `FeatureDataProvider`; it does not import `DebugToolkit` directly.
- **Hub** (`node/hub/`) owns the HTTP protocol, JSONL storage, retention, CLI commands, and Web Console. Storage selects bounded evidence from the full event window using occurrence time.
- **CLI** (`debug-toolkit diagnose`) discovers Hubs, resolves one target, and advances one resumable action at a time. `status`, `context`, `inspect`, and bounded `tail` remain compatibility commands.
- **Repository Skill** is the AI entry point. The canonical file is `node/hub/skills/react-native-debug-toolkit/SKILL.md`. `debug-toolkit init` copies it to `.agents/skills/react-native-debug-toolkit/SKILL.md` and maintains a marked section in `AGENTS.md`. Skill template version is independent from Hub protocol and npm package versions. The Skill interprets `diagnose` results and reports evidence; it does not invent Hub/appId/Session identifiers.
- **App protocol** is unchanged: Sessions are opened by the App, `/ready.apps` stays Session-derived, and diagnose is read-only.

## Module boundaries

- `src/core/` — Toolkit initialization and feature registry.
- `src/features/` — Independent feature factories and UI.
- `src/utils/HubClient.ts` — App-to-Hub runtime transport.
- `node/hub/` — Hub server, storage, CLI, and Web Console.
