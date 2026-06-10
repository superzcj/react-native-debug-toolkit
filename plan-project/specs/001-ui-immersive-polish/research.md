# Research: UI Immersive Polish & Animation Enhancement

**Date**: 2026-06-10 | **Branch**: `001-ui-immersive-polish`

## R1: Staggered List Item Animations with FlatList

**Decision**: `onViewableItemsChanged` + per-item `Animated.Value` with index-based stagger delay.

**Rationale**: FlatList virtualization means only visible items should animate. Each item gets its own opacity/translateY `Animated.Value`. When items become visible via `onViewableItemsChanged`, trigger `Animated.timing` with `delay: i * 30` (30ms stagger from spec). Use `useRef` for callback and config — FlatList requires stable references.

**Alternatives considered**:
- `LayoutAnimation` — no stagger control, all items animate simultaneously
- `ItemLayoutAnimation` (experimental) — not stable in RN 0.72
- `Animated.stagger` with fixed item list — breaks with virtualization (recycled items)

## R2: Panel Spring Parameters

**Decision**: `friction: 10, tension: 85` for panel open. `friction: 9, tension: 70` for snap-back after drag.

**Rationale**: Spec requires tension >= 80, friction <= 12. Current values (friction:8, tension:65) feel slightly sluggish. Higher tension (85) = snappier. Moderate friction (10) = controlled overshoot. Close to iOS Maps/Sheets bottom sheet feel.

**Alternatives considered**:
- `friction: 8, tension: 90` — slightly more bounce, may feel rubbery
- `friction: 12, tension: 80` — barely meets spec, may feel too damped

## R3: Reduce Motion Accessibility

**Decision**: Custom `useReduceMotion()` hook using `AccessibilityInfo.isReduceMotionEnabled()` + `addEventListener('reduceMotionChanged')`.

**Rationale**: RN 0.72 has no built-in hook. The imperative API works: initial Promise check + event listener for runtime changes. When enabled, replace all spring/stagger with simple `Animated.timing` (duration <= 200ms, opacity only).

**Alternatives considered**:
- `useAccessibilityInfo()` from community hooks — extra dependency, avoidable
- Check once on mount — won't react to runtime setting changes

## R4: Animated Height for CollapsibleSection

**Decision**: Use `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` before state toggle.

**Rationale**: Simpler than tracking height via `onLayout` + JS-driven `Animated.timing`. Current CollapsibleSection has no height animation at all — instant show/hide. LayoutAnimation gives smooth height transition in one line. Android requires `UIManager.setLayoutAnimationEnabledExperimental(true)` in host app setup.

**Alternatives considered**:
- `Animated.Value` height tracking — more control but requires height measurement, JS driver, more code
- `maxHeight` hack with `Animated.Value` — fragile, clips content

## R5: FAB Breathing/Idle Animation

**Decision**: `Animated.loop(Animated.sequence([scaleDown, scaleUp]))` with `Easing.inOut(Easing.sin)`, 1500ms each direction (3s total cycle).

**Rationale**: `Animated.loop` resets to initial value each iteration — correct for breathing pulse. Sine easing creates organic oscillation. Must stop on press (`PanResponder.onGrant`), resume on release with a brief delay.

**Alternatives considered**:
- Single `Animated.timing` with sine interpolation + `Animated.loop` — not possible with standard API
- CSS-style keyframe — not available in RN Animated

## R6: Animation Interruption/Cancellation

**Decision**: Store animation ref. Call `.stop()` on ref before starting new animation. Guard state changes with `start(({finished}) => ...)` callback.

**Rationale**: Current `useTabAnimation.ts` missing cancellation — calling `switchTab` during in-flight animation causes visual glitches. `Animated.parallel` with default `stopTogether: true` ensures all child animations stop together. The `{finished: false}` callback flag means interrupted — skip state transitions.

**Alternatives considered**:
- Debounce tab switches — adds perceived lag
- Queue animations — unnecessary complexity

## R7: Badge Count Bounce Micro-Animation

**Decision**: `Animated.sequence([spring(to:1.3, tension:300, friction:3), spring(to:1.0, tension:200, friction:4)])` triggered on count change.

**Rationale**: High tension + low friction = fast, punchy micro-animation (~250ms total). Feels snappy. Trigger via `useEffect` comparing previous and current count.

**Alternatives considered**:
- Single `Animated.spring` with overshoot — less control over max scale
- `Animated.timing` — no natural bounce feel

## Central Animation Config

All timing constants will live in `src/constants/animationConfig.ts` for consistency and Reduce Motion override:

```typescript
export const AnimationTiming = {
  panel: { springFriction: 10, springTension: 85, backdropDuration: 250 },
  tab: { fadeOutDuration: 80, fadeInDuration: 150, slideDuration: 200, staggerDelay: 30 },
  fab: { breathDuration: 1500, breathScaleMin: 0.97, pressScale: 0.94 },
  badge: { bounceScale: 1.3, tension: 300, friction: 3 },
  logItem: { tapScale: 1.02, tapDuration: 100, detailFadeDelay: 50 },
  reduceMotion: { maxDuration: 200 },
};
```
