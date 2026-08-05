# Shared Log Row and Collapsible Search Design

Date: 2026-08-05

## Goal

Give log messages the full card width by moving status icons and secondary information below the primary message. Apply the same responsive row behavior across built-in log-like tabs, and reclaim vertical list space by replacing the always-visible search row with a compact search action that expands in place.

## Current Problems

- Console Logs and Native Logs place a fixed status icon to the left of the message, reducing the width available to the most important content.
- Track, Zustand, and Session History repeat the same leading-indicator pattern.
- Network already places metadata below its primary path, but its footer is implemented locally and does not reliably handle long hosts or narrow widths.
- Navigation keeps actions at the right of its header, which can squeeze route content.
- Every feature implements its own row spacing, wrapping, truncation, and fixed-item behavior.
- `FeatureIntroCard` renders search as a dedicated second row whenever searchable data exists, even though search is a low-frequency action.

## Scope

The shared row layout applies to:

- Console Logs
- Native Logs
- Network
- Track
- Zustand
- The Console, Network, and Track rows inside Session History details
- Navigation

Environment, Clipboard, DevConnect, Third Party Libraries, and the Session History timeline remain unchanged because they are control, form, status, or timeline interfaces rather than log-row lists.

The search change applies to the panel-level search currently owned by `FloatPanelView` and rendered by `FeatureIntroCard`.

## Non-goals

- Do not change log capture, filtering semantics, ordering, persistence, or detail screens.
- Do not change the public `DebugFeature` API.
- Do not redesign control-oriented tabs.
- Do not add an icon, animation, or component dependency.
- Do not make the shared row data-driven with feature-specific fields.

## Shared Log Row

Add a focused shared component under `src/ui/shared/` with this conceptual interface:

```ts
interface LogRowProps {
  content: React.ReactNode;
  maxContentLines?: number;
  contentStyle?: StyleProp<TextStyle>;
  metadata?: React.ReactNode;
  trailingMetadata?: React.ReactNode;
}
```

`maxContentLines` defaults to `3`. Callers may supply a different positive line count where a specific row needs a tighter preview. The shared component owns the primary `Text`, so the line limit is applied consistently instead of relying on each caller to remember `numberOfLines`.

The component remains slot-based:

- `content` is text-compatible content rendered in the primary message area.
- `contentStyle` preserves feature-specific typography and error colors.
- `metadata` contains flexible status badges, sources, hosts, stores, or preview values.
- `trailingMetadata` contains information that must remain legible as a unit, such as timestamps, durations, and compact actions.

This boundary standardizes layout without encoding Network-, Zustand-, or Navigation-specific concepts in shared UI.

## Row Layout Rules

Each row has two vertical regions:

1. The primary message spans the full card width and may occupy up to `maxContentLines`, which defaults to three.
2. The footer sits below the message and contains flexible metadata plus trailing metadata.

The footer follows these rules:

- It uses a wrapping horizontal layout with separate row and column gaps.
- Flexible metadata may shrink and truncate to one line.
- Status icons and badges do not consume permanent space beside the primary message.
- Trailing metadata does not compress below legibility.
- When the combined footer is too wide, the trailing group moves intact to the next line.
- Missing metadata does not leave empty gaps or reserve height.
- Multi-line primary content never overlaps or changes the footer alignment rules.

A small shared metadata-text primitive may be added beside `LogRow` to enforce `minWidth: 0`, single-line truncation, and flex shrinking for long values. Feature-specific badges and indicators remain owned by their feature tabs.

## Per-tab Mapping

### Console Logs

- Primary content: joined console arguments.
- Flexible metadata: current level icon/badge.
- Trailing metadata: local timestamp.

### Native Logs

- Primary content: native message.
- Flexible metadata: level badge and joined platform/source/tag text.
- Trailing metadata: local timestamp.

### Network

- Primary content: request path.
- Flexible metadata: method, status, duration, and host.
- Trailing metadata: local timestamp.

The existing error color and slow-duration treatment remain.

### Track

- Primary content: event name.
- Flexible metadata: event marker and up to two existing property previews.
- Trailing metadata: local timestamp.

### Zustand

- Primary content: action name.
- Flexible metadata: action marker and optional store badge.
- Trailing metadata: optional duration and local timestamp.

### Session History Detail

Console, Network, and Track history rows use the same shared component and the same content hierarchy as their live equivalents. Session-specific type conversion stays in `SessionHistoryTab`.

### Navigation

- Primary content: the route transition, preserving both `from` and `to` values.
- Flexible metadata: action.
- Trailing metadata: optional duration, compact Copy action, and local timestamp.

Navigation keeps its existing non-detail list behavior.

## Collapsible Search

Replace the dedicated search row inside `FeatureIntroCard` with a compact search action in its top action area.

### Collapsed state

- Show a compact search button only when the active feature has searchable data.
- Keep it beside the existing top-level actions rather than on a separate row.
- When a non-empty query is active, visually mark the button so hidden filtering is discoverable.

### Expanded state

- Replace the title, metrics, status, and All/Bad controls with a full-width search field in the same header region.
- Focus the field immediately after expansion.
- Keep the header height stable; expanding search must not push the log list down.
- Allow the user to collapse the field without clearing the current query.

### Reset behavior

- Switching tabs clears the query, resets the Bad filter, and returns search to its collapsed state.
- Clear All performs the same search reset before clearing feature data.
- Clearing the input removes the active indication.
- Tabs without searchable data do not render the search action.

`FloatPanelView` remains the owner of `searchQuery`, filtering, and the controlled `searchExpanded` state. It resets all three values on tab switches and Clear All. `FeatureIntroCard` owns only the search presentation and reports expand/collapse requests through callbacks.

## Data Flow

```text
active feature snapshot
  -> buildFeatureSummary
  -> search availability + header metrics
  -> collapsed or expanded search presentation
  -> filterFeatureSnapshot(query, All/Bad)
  -> feature list
  -> shared LogRow(content, metadata, trailingMetadata)
```

No capture or persistence layer changes are involved.

## Accessibility

- The collapsed search control has a search accessibility label and button role.
- The expanded field keeps `returnKeyType="search"` and a search placeholder.
- The collapse control has an explicit label; it is not communicated only through an icon glyph.
- Existing card press targets and Navigation Copy behavior remain available.
- Status remains represented by readable text or badge content, not color alone.

## Testing

Add focused Jest coverage using the repository's current React and React Native mocks; do not add a renderer dependency solely for these tests.

Shared row coverage:

- Omitting `maxContentLines` produces a three-line primary preview.
- An explicit positive `maxContentLines` overrides the default.
- Metadata and trailing metadata are rendered in separate layout groups.
- Footer styles wrap, flexible metadata can shrink, and trailing metadata remains non-shrinking.
- Missing footer slots do not render empty layout groups.

Search coverage:

- Search starts collapsed.
- Activating search expands it without adding a second header row.
- Collapsing preserves a non-empty query and exposes active styling.
- Clearing the query removes active styling.
- A feature/tab reset collapses search and clears its presentation state.
- Tabs without searchable data omit the search action.

Regression coverage:

- Existing `filterFeatureSnapshot` query and Bad-filter behavior remains unchanged.
- Existing feature summary and rail tests remain green.
- TypeScript accepts all migrated tab rows and the shared component contract.

Manual Demo verification uses a narrow phone-width panel and includes:

- A three-line Console message.
- A Native row with long platform/source/tag metadata.
- A Network row with a long host, duration, status, and timestamp.
- Track preview chips that wrap.
- A Navigation row containing duration, Copy, and timestamp.
- Search expansion and collapse with both empty and active queries.

## Acceptance Criteria

- Primary log content spans the full card width in every in-scope tab.
- Status icons and indicators appear in the footer rather than in a permanent left column.
- Primary previews default to a maximum of three lines and support a caller-provided override.
- Long footers truncate flexible text and wrap fixed trailing content without overlap or clipping.
- All in-scope tabs use the shared row component rather than duplicating the responsive structure.
- Search no longer occupies a dedicated row while collapsed.
- Expanded search uses the existing header space and does not change header height.
- A collapsed active query remains visibly indicated.
- Existing filtering, detail views, ordering, and data collection behavior remain unchanged.
