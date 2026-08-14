# Web Console Live Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render incoming Hub SSE logs without rebuilding the active Web Console detail page.

**Architecture:** Keep the server protocol and full detail renderer. Extract reusable log-row markup and event binding; live SSE events update state and only mutate counters, pager, indicator, and at most one inserted row. An indicator sends filter/page-incompatible events through the existing intentional full render path.

**Tech Stack:** Node.js inline Web Console, SSE `EventSource`, Jest.

## Global Constraints

- Modify `node/hub/src/console/console.html` and `node/hub/__tests__/hubServer.test.js` only.
- Keep existing HTTP and SSE protocol unchanged.
- Do not add dependencies.
- Do not call `renderDetail()` or replace `#app.innerHTML` from the SSE event listener.
- Preserve ordering, search, type filter, failed-only filter, pagination, manual refresh, and Live toggle semantics.

---

### Task 1: Lock live update contract with regression test

**Files:**
- Modify: `node/hub/__tests__/hubServer.test.js:38-60`

**Interfaces:**
- Consumes: served Web Console HTML from `GET /console`.
- Produces: a failing assertion requiring `appendLiveEvent(event)` to own SSE UI updates.

- [ ] **Step 1: Write failing test**

Add this test body after existing console markup assertions:

```js
const liveHandler = consolePage.body.match(
  /stream\.addEventListener\('event', message => \{([\s\S]*?)\}\); stream\.onerror/
);

expect(consolePage.body).toContain('function appendLiveEvent(event)');
expect(liveHandler?.[1]).toContain('appendLiveEvent(event)');
expect(liveHandler?.[1]).not.toContain('renderDetail()');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- node/hub/__tests__/hubServer.test.js --runInBand
```

Expected: FAIL because `appendLiveEvent(event)` does not exist and the SSE callback invokes `renderDetail()`.

### Task 2: Add in-place Web Console live updates

**Files:**
- Modify: `node/hub/src/console/console.html:44,157-194`

**Interfaces:**
- Consumes: `state.events`, active filters, selected page, and SSE events containing monotonically increasing `sequence`.
- Produces: `appendLiveEvent(event)`, `renderLogEntry(event)`, `bindLogEntry(entry)`, and focused in-place UI updaters.

- [ ] **Step 1: Extract event-row helpers**

Move the log-entry HTML currently assembled inside `renderDetail()` into:

```js
function renderLogEntry(event) {
  const rowId = 'entry-' + event.sequence;
  return '<article class="log-entry" id="' + rowId + '"><div class="log-row"><div class="log-type log-type-' + typeClass(event.type) + '">' + esc(typeLabel(event.type)) + '</div><div class="log-summary-col"><div class="log-summary">' + esc(summary(event)) + '</div><div class="log-timestamp">' + esc(formatTimeShort(event.receivedAt || event.timestamp)) + '</div></div><div class="log-status">' + statusBadge(event) + '</div><div class="log-copy"><button class="copy-btn" data-copy-sequence="' + event.sequence + '" title="Copy event">⧉</button></div><div class="log-expand" data-collapse title="Toggle details">›</div></div><div class="log-detail"><div class="log-detail-inner">' + renderEventDetails(event) + '</div></div></article>';
}
function bindLogEntry(entry) {
  entry.querySelector('.log-row').addEventListener('click', event => {
    if (event.target.closest('[data-copy-sequence], [data-collapse]')) return;
    entry.classList.toggle('expanded');
  });
  entry.querySelector('[data-collapse]').addEventListener('click', () => {
    entry.classList.toggle('expanded');
  });
  entry.querySelector('[data-copy-sequence]').addEventListener('click', event => {
    event.stopPropagation();
    copyText(stringify(state.events.find(value => String(value.sequence) === event.currentTarget.dataset.copySequence)));
  });
}
```

Render initial rows with `visible.map(renderLogEntry).join('')`, then bind each row with `bindLogEntry`. Keep generated IDs as `entry-${event.sequence}`.

- [ ] **Step 2: Add stable update targets**

Give header count, pager range/page, pager buttons, and the pending-update control stable IDs. Add `pendingLiveUpdates: 0` to `state`. Render an initially hidden button:

```html
<button class="btn" id="liveUpdateButton" hidden></button>
```

Its click handler clears `state.pendingLiveUpdates` and calls `renderDetail()`; this is a user-requested full refresh, not an SSE-triggered refresh.

- [ ] **Step 3: Implement minimal SSE updater**

Add helpers that:

```js
function appendLiveEvent(event) {
  state.events.push(event);
  state.maxSequence = event.sequence;
  updateLiveCounters();
  if (!insertVisibleLiveRow(event)) {
    state.pendingLiveUpdates += 1;
    updateLiveUpdateButton();
  }
}
```

`insertVisibleLiveRow(event)` returns `true` only when the detail list exists, `state.page === 1`, and `event` occurs in `filteredEvents().slice(0, PAGE_SIZE)`. It inserts the rendered row before its next visible sibling, binds only that row, and removes rows beyond `PAGE_SIZE`.

```js
const visible = filteredEvents().slice(0, PAGE_SIZE);
const position = visible.findIndex(value => value.sequence === event.sequence);
if (position < 0 || state.page !== 1) return false;
const list = app.querySelector('.log-list');
if (!list) return false;
list.insertAdjacentHTML('beforeend', renderLogEntry(event));
const entry = $('#entry-' + event.sequence);
const next = visible[position + 1];
list.insertBefore(entry, next ? $('#entry-' + next.sequence) : null);
bindLogEntry(entry);
while (list.children.length > PAGE_SIZE) list.lastElementChild.remove();
return true;
```

`updateLiveCounters()` updates existing DOM text/disabled state for total entries, existing type tabs, and pager. `updateLiveUpdateButton()` changes only `#liveUpdateButton` text and `hidden` state.

- [ ] **Step 4: Route EventSource through updater**

Replace direct re-render in `startStream()` with:

```js
if (event.sequence > state.maxSequence) appendLiveEvent(event);
```

Do not change malformed-event handling, duplicate suppression, reconnect behavior, or URL construction.

- [ ] **Step 5: Run focused test to verify it passes**

Run:

```bash
npm test -- node/hub/__tests__/hubServer.test.js --runInBand
```

Expected: PASS; live handler calls `appendLiveEvent(event)`, never `renderDetail()`.

- [ ] **Step 6: Commit**

```bash
git add node/hub/src/console/console.html node/hub/__tests__/hubServer.test.js
git commit -m "fix: preserve console state during live logs"
```

### Task 3: Verify regression boundary

**Files:**
- Verify: `node/hub/src/console/console.html`
- Verify: `node/hub/__tests__/hubServer.test.js`

**Interfaces:**
- Consumes: completed Tasks 1-2.
- Produces: automated and manual evidence that stream rendering is non-destructive.

- [ ] **Step 1: Run Hub test suite**

```bash
npm test -- node/hub/__tests__ --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 3: Manual browser check**

1. Run `npm run hub`.
2. Open `http://127.0.0.1:3800/console`, select a session, expand a log row.
3. Focus search or scroll the list away from its top.
4. Generate a new App log.
5. Verify existing focus, scroll position, filters, expanded row, and page remain unchanged; an inserted row or new-log button appears.
