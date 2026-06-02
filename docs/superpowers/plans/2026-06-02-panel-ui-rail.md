# Panel UI Rail Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans`. Keep changes small. Steps use checkbox syntax.

**Goal:** Replace top horizontal tab bar with narrow left feature rail and status-first panel header.

**Architecture:** Keep `DebugFeature` contract unchanged. `FloatPanelView` still owns active tab, persistence, swipe, subscriptions. New rail is visual/nav layer only.

**Tech Stack:** React Native, TypeScript, Jest, existing `Animated`/`PanResponder`.

---

## Shape

- Left rail width: `56px` target, `64px` max.
- Rail item hit area: `52px` height, satisfies touch target.
- Label: 3-4 char short text (`Net`, `Con`, `Nat`, `Nav`, `Zst`, `Trk`, `Clip`, `Env`, `Dev`).
- Full feature label shown in content header, not rail.
- Custom tabs: first 3 chars fallback, full `accessibilityLabel`.
- No icons dependency.
- No nested dashboard.
- `DevConnect` stays feature tab, but sync state also visible in panel header.

## Files

- Create: `src/ui/panel/FeatureRail.tsx`
- Modify: `src/ui/panel/FloatPanelView.tsx`
- Modify: `src/ui/panel/DebugPanel.tsx`
- Modify: `src/ui/panel/useTabAnimation.ts`
- Add tests: `src/__tests__/ui/featureRail.test.tsx`
- Keep: `src/ui/panel/FeatureTabBar.tsx` for compatibility until cleanup.

## Tasks

### Task 1: Rail Label Model

- [ ] Add `shortLabelForFeature(label, id)` helper in `FeatureRail.tsx`.
- [ ] Built-in map: `network=Net`, `console=Con`, `native=Nat`, `navigation=Nav`, `zustand=Zst`, `track=Trk`, `clipboard=Clip`, `environment=Env`, `devConnect=Dev`.
- [ ] Fallback: trim label, take first 3 chars.
- [ ] Test helper.

### Task 2: FeatureRail UI

- [ ] Build vertical `ScrollView` rail, width `56`.
- [ ] Item: short label + small count/dot.
- [ ] `accessibilityRole="tab"`, `accessibilityLabel={full label}`.
- [ ] Active item: white bg + dark text + thin left blue bar.
- [ ] Error/warn dot derived from snapshot if possible; otherwise neutral dot.
- [ ] No external icon lib.

### Task 3: Panel Layout

- [ ] In `FloatPanelView`, replace top `FeatureTabBar` render with two-column layout:
  - left: `FeatureRail`
  - right: active feature content
- [ ] Keep existing `activeTab`, last-tab persistence, subscriptions.
- [ ] Keep swipe tab switching, but only on right content pane.
- [ ] Add active feature title row above content: full label + optional count.

### Task 4: Header Signals

- [ ] In `DebugPanel`, add compact signal row under title.
- [ ] Signals:
  - live sync status from `devConnect` badge/state when available
  - active route if navigation snapshot has latest route
  - urgent count from visible feature snapshots
- [ ] Keep `Clear` and close buttons.
- [ ] Header must stay under `110px` height.

### Task 5: Tests

- [ ] `FeatureRail` renders short labels.
- [ ] Active rail item calls `onSelectTab(index)`.
- [ ] Custom tab uses fallback short label and full accessibility label.
- [ ] `FloatPanelView` restores last tab by feature name.
- [ ] Swipe still switches active feature.

### Task 6: Verify

- [ ] `npx jest src/__tests__/ui/featureRail.test.tsx --runInBand`
- [ ] `npx jest src/__tests__/ui/tabPersistence.test.ts --runInBand`
- [ ] `npm run typecheck`
- [ ] Manual Demo check on phone width: rail stays narrow, content readable, no text overlap.

## Non-goals

- No Web Console redesign.
- No API change to `DebugFeature`.
- No icon package.
- No grouping/sub-tabs.
- No dashboard first screen.
