# Domain Glossary

## Core Concepts

- **Device** — Mobile device running the React Native app with debug toolkit embedded
- **Daemon** — Desktop HTTP server (node/daemon) that receives, persists, and serves debug logs from connected devices
- **Feature** — A debug capability registered with the toolkit (network, console, zustand, navigation, track, environment, clipboard)
- **Stream** — Continuous connection from device to daemon for real-time log delivery (delta-based)
- **Report** — A full snapshot of device debug data (all features' logs + device info)
- **Delta** — Incremental update containing only new log entries since last sync
- **Channel** — Pub/sub event bus used by features to broadcast events
- **FeatureDataProvider** — Interface that provides feature list and change notifications to consumers (DaemonClient). Decouples transport from feature registry.

## Architecture

- **Feature Registry** (`DebugToolkit`) — Class that manages feature lifecycle (setup/cleanup/snapshot). Implements `FeatureDataProvider`.
- **Feature Factory** — Function that creates a `DebugFeature` instance (e.g., `createNetworkFeature`)
- **DaemonClient** — Class that manages all device-to-daemon communication (streaming, one-shot reports, health checks, retry, delta tracking). Accepts `FeatureDataProvider` at construction — does not import DebugToolkit directly.
- **Channel Feature** — Simple feature using `createChannelFeature` helper (track, navigation, zustand, network)
- **Complex Feature** — Feature with custom interception logic (console)
- **URL Rewriter Seam** (`src/utils/urlRewriter.ts`) — Neutral seam for URL rewriting. Environment feature registers rewriter; network interceptor reads it. No direct dependency between the two features.

## Module Boundaries

- `src/core/` — Toolkit initialization, feature registry, provider
- `src/features/` — Feature factories (each is independent)
- `src/utils/` — Shared utilities (DaemonClient, stores, channels)
- `node/daemon/` — Server-side HTTP API for receiving and serving debug logs
- `node/mcp/` — MCP server adapter for Claude integration
