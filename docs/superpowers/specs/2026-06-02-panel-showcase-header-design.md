# Panel Showcase Header Design

Date: 2026-06-02

## Goal

Improve the in-app Debug Toolkit panel as a feature showcase without replacing the current rail workbench. A user should open any feature tab and quickly understand what that feature captures, what is currently present, and what action is useful next.

This design follows the chosen direction: Showcase Header plus a small amount of per-feature polish.

## Non-goals

- Do not add a new Overview or dashboard tab.
- Do not change the `DebugFeature` public API.
- Do not redesign the daemon web console.
- Do not change data capture behavior.
- Do not add an icon dependency.
- Do not rewrite every feature tab.

## Current Problems

- The rail shows feature abbreviations and counts, but not feature value.
- The panel title row is too thin for product demonstration. It says which tab is active, but not why the feature matters.
- Header signals are currently badge-driven, so they can feel like raw status instead of curated product highlights.
- Search/filter behavior is inconsistent. `NetworkLogTab` has its own search while `FloatPanelView` also has a toolbar.
- The `Bad` filter only checks a `level` field, so network failures such as 500 responses are missed.
- Non-array snapshots cannot be filtered, which makes the toolbar misleading for features such as Environment and DevConnect.
- Network rows do not match the density shown in `docs/ui-tab-demo.html`.

## Proposed UX

Keep the vertical feature rail and active feature pane. Replace the thin active title row with a `FeatureIntroCard` at the top of the active pane.

Each tab begins with:

- Feature title, for example `Network`.
- Capability line, for example `HTTP capture, status, duration, request and response body`.
- Summary metrics, for example `12 captured`, `3 bad`, `latest POST /orders`.
- Optional primary action chips when useful, for example `Bad`, `Copy latest`, or `Clear feature`.

The user then sees a single search/filter toolbar and the existing feature content list.

## Header Signals

Panel-level header signals should become showcase highlights, not a raw list of feature badges.

Target signals:

- Network activity, for example `Network 12`.
- Navigation context, for example `Route cart/pay`.
- Desktop sync state, for example `Live sync on` or `26 synced`.

Limit remains three cards. Signal cards stay compact and reuse the existing red, amber, and neutral backgrounds.

## Components

### FeatureIntroCard

New panel component owned by `FloatPanelView`.

Inputs:

- `feature`
- `snapshot`
- `summary`
- Optional callbacks for supported actions

Outputs:

- Title
- Capability text
- Metric row
- Optional action row

This component is present for every feature. Unknown custom features use fallback copy derived from the feature label and snapshot count.

### buildFeatureSummary

New helper near the panel layer, ideally exported for tests.

Return shape:

```ts
interface FeatureSummary {
  capabilityText: string;
  count?: number;
  badCount?: number;
  latestLabel?: string;
  statusLabel?: string;
  statusColor?: string;
  filterMode?: 'all' | 'bad';
  supportsBadFilter: boolean;
}
```

Feature-specific behavior:

- Network: count requests, count `error || response.status >= 400`, latest method/path/status.
- Console and Native: count logs, count `warn | error | fatal`, latest message.
- Navigation: count events, latest `from -> to` or active route if available.
- Zustand: count state changes, latest action and store name.
- Track: count events, latest event name.
- Clipboard: count clipboard events, latest copied value preview if available.
- Environment: count environments, current environment label.
- DevConnect: sync status, endpoint/host, streaming state.
- Unknown: count array snapshots and show generic capability text.

### filterFeatureSnapshot

Replace the current ad hoc filter in `FloatPanelView`.

Rules:

- If snapshot is not an array, return it unchanged and hide unsupported filters.
- Query uses stable string matching through `JSON.stringify(item).toLowerCase()`.
- Network `Bad`: `item.error || item.response?.status >= 400`.
- Console and Native `Bad`: `level` is `warn`, `error`, or `fatal`.
- Other features hide `Bad` unless a meaningful rule exists.

## Per-feature Polish

### Network

Remove the internal `NetworkLogTab` search header. The panel toolbar becomes the only search surface.

Row layout:

- First row: method chip, request path, status chip.
- Second row: duration, host/path preview, time.
- Error rows use the existing error color and a subtle left indicator.

Detail view stays unchanged.

### Other Tabs

Keep other tab internals mostly unchanged. They benefit from the new intro card and unified toolbar.

## Data Flow

```text
features
  -> active feature snapshot
  -> buildFeatureSummary(feature, snapshot)
  -> rail count + header signals + FeatureIntroCard + toolbar visibility
  -> filterFeatureSnapshot(feature, snapshot, query, filterMode)
  -> feature.renderContent({ snapshot: filteredSnapshot, feature })
```

`FloatPanelView` remains the owner of active tab, persistence, subscriptions, swipe animation, search state, and filter state.

## Implementation Scope

Files expected to change:

- `src/ui/panel/FloatPanelView.tsx`
- `src/ui/panel/DebugPanel.tsx`
- `src/features/network/NetworkLogTab.tsx`
- `src/ui/panel/FeatureRail.tsx` only if rail metadata needs a small prop adjustment
- `src/ui/theme/colors.ts` only for panel-specific colors
- New focused tests under `src/__tests__/ui/`

## Testing

Add tests for helper behavior:

- `buildFeatureSummary` for Network count, bad count, and latest label.
- `buildFeatureSummary` for Console warn/error status.
- `buildFeatureSummary` for Environment active environment.
- `buildFeatureSummary` for DevConnect streaming state.
- `filterFeatureSnapshot` includes Network 500 and network error entries in `Bad`.
- `filterFeatureSnapshot` includes Console warn/error/fatal entries in `Bad`.
- Query filter can search URL, method, console message, and event data.
- Non-array snapshots are returned unchanged.

Keep existing rail label tests.

Verification commands:

```sh
npx jest src/__tests__/ui/featureRail.test.ts --runInBand --watchman=false
npx jest src/__tests__/ui/panelFeatureSummary.test.ts --runInBand --watchman=false
npm run typecheck
git diff --check
```

## Acceptance Criteria

- Each tab has a clear feature intro card above the list.
- Header signals describe the most useful showcase highlights, max three.
- Only one search input is visible for Network.
- `Bad` filter works for Network HTTP failures and Console/Native warning or error logs.
- Unsupported features do not show misleading `Bad` controls.
- Network rows show method, path, status, duration, host, and time with higher density.
- Existing active-tab persistence and swipe behavior still work.
