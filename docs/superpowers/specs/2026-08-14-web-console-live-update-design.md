# Web Console Live Update Design

Date: 2026-08-14

## Goal

New SSE log events update the open session without rebuilding the Web Console page. Preserve the user's scroll position, focused search input, expanded event details, filters, and selected page.

## Root Cause

`startStream()` appends every received event to `state.events`, then calls `renderDetail()`. `renderDetail()` replaces `#app.innerHTML`, so every existing DOM node is discarded for each new event.

## Scope

- Modify `node/hub/src/console/console.html` only.
- Keep existing HTTP and SSE protocol unchanged.
- Keep ordering, search, type filter, failed-only filter, pagination, manual refresh, and Live toggle semantics unchanged.

## Design

Extract the existing event-row markup and listener wiring into focused helpers. Initial session loading and user actions may still use `renderDetail()`.

For an SSE event with a sequence greater than `state.maxSequence`:

1. Append it to `state.events` and advance `state.maxSequence`.
2. Update only affected counters and pager metadata in place.
3. If it matches the active filters and the viewer is on page 1, insert its row at the top of the existing list. Do not touch existing rows.
4. Otherwise, retain the event in state and show an in-place new-log indicator. The user can opt to render the updated view.

The in-place update must not use `renderDetail()` or assign to `#app.innerHTML`.

## Error Handling

- Invalid SSE payloads remain ignored.
- Duplicate or replayed sequences remain ignored.
- If the detail DOM is unavailable, retain the event in state; the next user-initiated render reads the authoritative state.

## Testing

Add a regression assertion to the existing Hub console test that verifies the served page contains the dedicated live-update path and that the SSE listener dispatches to it instead of calling `renderDetail()` directly. Run focused Hub tests, then lint.

Manual check: open a session, expand a row, focus search or scroll within logs, then generate a log. Existing UI state remains in place; new-log indicator or inserted row appears.

## Acceptance Criteria

- Receiving a log does not replace the detail page DOM.
- Focus, expanded rows, filters, and pagination state survive a live update.
- Every event is retained in `state.events` even when it is not immediately rendered.
- Existing Hub tests and lint pass.
