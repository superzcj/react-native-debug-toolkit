# Domain Glossary

## Core concepts

- **Feature** — An in-app debug capability such as Network, Console, Native, Navigation, Track, Zustand, Environment, or Clipboard.
- **FeatureDataProvider** — The Toolkit feature registry exposed to `HubClient` for snapshots and change notifications.
- **HubClient** — The one App-side transport. It opens the current runtime Session, batches events, and retries in memory with sequence/ACK protection.
- **Session** — One App runtime connected to a Shared Hub.
- **Event** — A normalized debug record with a sequence number and payload hash.
- **Shared Hub** — The trusted-LAN HTTP service that persists sessions, exposes CLI APIs, and serves the human Web Console.

## Architecture

- **Feature Registry** (`DebugToolkit`) manages feature setup, cleanup, snapshots, and subscriptions.
- **Feature Factories** create independent Toolkit features such as `createNetworkFeature`.
- **HubClient** consumes the feature registry through `FeatureDataProvider`; it does not import `DebugToolkit` directly.
- **Hub** (`node/hub/`) owns the HTTP protocol, JSONL storage, retention, CLI commands, and Web Console.
- **Repository Skill** is the AI entry point. It calls the CLI to run `status`, `context`, `inspect`, and bounded `tail`.

## Module boundaries

- `src/core/` — Toolkit initialization and feature registry.
- `src/features/` — Independent feature factories and UI.
- `src/utils/HubClient.ts` — App-to-Hub runtime transport.
- `node/hub/` — Shared Hub server, storage, CLI, and Web Console.
