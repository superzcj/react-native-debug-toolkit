# Quickstart: UI Immersive Polish Validation Guide

**Branch**: `001-ui-immersive-polish` | **Date**: 2026-06-10

## Prerequisites

- React Native 0.72+ dev environment (iOS simulator + Android emulator)
- Demo app running: `cd Demo && npm start`
- Physical device recommended for gesture/haptic testing

## Setup

```bash
# From repo root — build the library
npm run prepare

# Run Demo app
cd Demo
npm install
npx react-native run-ios    # or run-android
```

## Validation Scenarios

### V1: Panel Open/Close Spring + Backdrop (P1)

**Steps**:
1. Launch Demo app — FAB visible
2. Tap FAB → panel slides up with spring animation
3. Verify: semi-transparent backdrop behind panel (opacity ~0.5)
4. Verify: FAB scales down before panel opens
5. Swipe panel down past 40% → panel dismisses with velocity-matched animation
6. Repeat rapidly 10 times → no jank, no stuck states

**Pass criteria**: Panel open 300-500ms, smooth spring, backdrop visible, FAB scale-down. No visual glitches on rapid open/close.

### V2: Tab Switching Staggered Reveal (P1)

**Steps**:
1. Open debug panel
2. Tap Console tab in FeatureRail
3. Verify: content fades out, then new tab header appears, then list items stagger in (top-to-bottom, ~30ms between items)
4. Switch between 3+ tabs rapidly (< 200ms between taps)
5. Verify: no visual artifacts, final target tab renders correctly

**Pass criteria**: Staggered reveal visible, 400ms for first 10 items. Rapid switching cancels cleanly.

### V3: Log Item Expand/Collapse with Feedback (P2)

**Steps**:
1. Open Network tab — network logs visible
2. Tap a log item → verify scale pulse (1.02x, brief)
3. Verify: detail section expands with spring animation, JSON fades in after 50ms delay
4. Tap same item to collapse → JSON fades out first, then section collapses
5. Expand 10 different items → consistent timing, no layout jumps

**Pass criteria**: Scale pulse visible, expand/collapse smooth, consistent across items.

### V4: FAB Breathing + Badge Bounce (P2)

**Steps**:
1. Close debug panel — FAB visible
2. Wait 3 seconds → FAB should pulse (scale 0.97-1.0, 3s cycle)
3. Drag FAB → breathing stops. Release → snaps to edge with spring overshoot
4. Release FAB → breathing resumes after brief delay
5. Trigger new logs (e.g., make network requests) → badge count updates with bounce

**Pass criteria**: Continuous breathing when idle, stops on touch, badge bounces on count increase.

### V5: Search/Filter Animated Transitions (P3)

**Steps**:
1. Open Console tab
2. Tap search icon → search bar slides down from header (200ms)
3. Type "error" → non-matching items fade out, gaps collapse
4. Clear query → items fade back in with stagger
5. Dismiss search → bar slides up

**Pass criteria**: Search bar animation smooth, filter transitions visible, no layout jumps.

### V6: Reduce Motion Accessibility

**Steps**:
1. Enable Reduce Motion in iOS Settings > Accessibility > Motion
2. Relaunch Demo app
3. Open/close panel → should be simple fade (≤200ms), no spring bounce
4. Switch tabs → no stagger, simple fade only
5. Observe FAB → no breathing pulse
6. Disable Reduce Motion → animations return to full

**Pass criteria**: All spring/stagger animations replaced with simple fades when reduce motion enabled.

### V7: Performance — 60fps

**Steps**:
1. Open iOS Perf Monitor (Dev Menu → Perf Monitor)
2. Perform rapid panel open/close, tab switching, log expansion
3. Verify: FPS stays at 60 (or close) during all animations
4. On Android: use `adb shell dumpstats gfxinfo` to check jank frames

**Pass criteria**: No visible frame drops during normal debug usage. All transform/opacity animations use native driver.

## File References

- Animation config: `src/constants/animationConfig.ts` (see [data-model.md](./data-model.md) for all values)
- Panel animation: `src/ui/panel/DebugPanel.tsx`
- Tab animation: `src/ui/panel/useTabAnimation.ts`
- FAB animation: `src/ui/floating/FloatIcon.tsx`
- CollapsibleSection: `src/ui/shared/CollapsibleSection.tsx`
- Reduce Motion hook: `src/hooks/useReduceMotion.ts`
