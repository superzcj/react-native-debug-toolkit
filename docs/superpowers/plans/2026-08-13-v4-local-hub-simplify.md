# v4 Local Hub Simplify Implementation Plan

> **For agentic workers:** Execute inline on `main`. **Do not commit** (user constraint).

**Goal:** Align the existing v4 Hub with the AI-first local design: delete public Hub install paths and shrink storage/protocol to one manifest + one JSONL per session.

**Architecture:** Keep `hub dev`, App `HubClient`, CLI read commands, and Web Console. Remove LaunchDaemon install, identity registry, signed cursors, generations, payloadHash, and segment compaction.

**Tech Stack:** Node Hub (`node/hub`), React Native `HubClient`, Jest.

## Global Constraints

- Only user-facing Hub command: `npx debug-toolkit hub dev`
- Storage: `{dataDir}/{safeAppId}/{sessionId}/manifest.json` + `events.jsonl`
- Wire event fields: `sequence`, `timestamp`, `type`, `severity`, `data` (no `payloadHash`)
- No `generation`, signed cursor, identity registry, tombstone, or segment files
- Tail/stream resume via numeric `sinceSequence` / SSE `id` = sequence string
- Retention: delete whole Session when `lastActiveAt` > 7 days; reject writes at 20 GB
- Duplicate sequences: return current `ackThrough`, do not rewrite
- No git commits in this execution

---

### Task 1: Delete public Hub install

**Files:**
- Delete: `node/hub/src/cli/commands/hubInstall.js`
- Modify: `node/hub/src/cli/main.js` — remove install/update help and handlers
- Modify: `node/hub/__tests__/cli.test.js` — drop installer tests; keep `hub dev` + `init`
- Modify: `README.md`, `README.zh-CN.md`, `Demo/README.md` — local Hub only

### Task 2: Simplify Hub storage + HTTP protocol

**Files:**
- Create: `node/hub/src/storage/fsUtils.js` (Mutex, atomicWriteJson, fsyncDir)
- Rewrite: `node/hub/src/storage/sessionStore.js`, `hubStore.js`
- Delete: `identityRegistry.js`, `segmentWriter.js`, `sessionLedger.js`, `protocol/cursor.js`
- Modify: `routes.js`, `validation.js`, `envelope.js`, `protocol/index.js`, `storage/index.js`
- Rewrite tests: `hubServer.test.js`, `protocol.test.js`

### Task 3: Align App HubClient + CLI tail

**Files:**
- Modify: `src/utils/HubClient.ts` — drop payloadHash + generation from wire/API
- Modify: `src/__tests__/utils/HubClient.test.ts`
- Modify: `node/hub/src/cli/commands/tail.js` — `--since-sequence` instead of signed `--cursor`
- Modify: `node/hub/src/cli/main.js` help

### Task 4: Verify

- `npm test -- --testPathPattern='node/hub|HubClient|HubEndpoint|devConnectV4'`
- `npx tsc --noEmit` (or project typecheck script)
- Record unrelated baseline failures
