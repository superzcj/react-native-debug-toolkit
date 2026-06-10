# Data Model: UI Immersive Polish & Animation Enhancement

**Date**: 2026-06-10 | **Branch**: `001-ui-immersive-polish`

## Entities

### AnimationConfig (constants)

Static configuration object. No runtime state. Lives in `src/constants/animationConfig.ts`.

| Field | Type | Default | Description |
|---|---|---|---|
| `panel.springFriction` | `number` | 10 | Panel open/close spring friction |
| `panel.springTension` | `number` | 85 | Panel open/close spring tension |
| `panel.backdropDuration` | `number` | 250 | Backdrop fade duration (ms) |
| `panel.backdropOpacity` | `number` | 0.5 | Backdrop max opacity |
| `tab.fadeOutDuration` | `number` | 80 | Outgoing tab fade duration (ms) |
| `tab.fadeInDuration` | `number` | 150 | Incoming tab fade duration (ms) |
| `tab.slideDuration` | `number` | 200 | Incoming tab slide duration (ms) |
| `tab.staggerDelay` | `number` | 30 | Stagger delay between items (ms) |
| `tab.maxStaggerItems` | `number` | 15 | Max items to stagger (perf cap) |
| `fab.breathDuration` | `number` | 1500 | Half-cycle of breathing pulse (ms) |
| `fab.breathScaleMin` | `number` | 0.97 | Breathing min scale |
| `fab.pressScale` | `number` | 0.94 | Press-down scale |
| `fab.edgeSnapFriction` | `number` | 7 | Edge snap spring friction |
| `fab.edgeSnapTension` | `number` | 40 | Edge snap spring tension |
| `badge.bounceScale` | `number` | 1.3 | Badge bounce max scale |
| `badge.tension` | `number` | 300 | Badge spring tension |
| `badge.friction` | `number` | 3 | Badge spring friction |
| `logItem.tapScale` | `number` | 1.02 | Log item tap pulse scale |
| `logItem.tapDuration` | `number` | 100 | Tap pulse duration (ms) |
| `logItem.detailFadeDelay` | `number` | 50 | Detail content fade-in delay (ms) |
| `logItem.expandFriction` | `number` | 9 | Expand spring friction |
| `logItem.expandTension` | `number` | 60 | Expand spring tension |
| `reduceMotion.maxDuration` | `number` | 200 | Max animation duration when reduce motion on |
| `search.slideDuration` | `number` | 200 | Search bar slide duration (ms) |
| `filter.fadeOutDuration` | `number` | 150 | Filtered item fade out (ms) |

### AnimationState (runtime, per-component)

Not a formal type — managed via `Animated.Value` refs in hooks and components.

| Context | Animated Values | Component/Hook |
|---|---|---|
| Panel | `translateY`, `backdropOpacity` | `DebugPanel.tsx` |
| Tab content | `contentOpacity`, `contentTranslateX` | `useTabAnimation.ts` |
| Tab items | `Map<number, Animated.Value>` (per-item opacity) | New: `useStaggerAnimation.ts` |
| FAB | `scale`, `badgeScale` | `FloatIcon.tsx` |
| Log item expand | `tapScale`, `detailOpacity`, `heightAnim` | `CollapsibleSection.tsx` |
| Search | `searchBarTranslateY` | `FeatureIntroCard.tsx` |

### useReduceMotion Hook

| Output | Type | Description |
|---|---|---|
| `reducedMotion` | `boolean` | True when system reduce motion enabled |

Wraps `AccessibilityInfo.isReduceMotionEnabled()` + event listener. Components read this to swap animation configs.

## Relationships

```
AnimationConfig ──provides defaults──→ all Animated.Values
                                    │
useReduceMotion ──overrides──→ AnimationConfig durations
                             (caps at reduceMotion.maxDuration)
                                    │
DebugPanel ──uses──→ AnimationConfig.panel
useTabAnimation ──uses──→ AnimationConfig.tab
FloatIcon ──uses──→ AnimationConfig.fab + AnimationConfig.badge
CollapsibleSection ──uses──→ AnimationConfig.logItem
FeatureIntroCard ──uses──→ AnimationConfig.search + AnimationConfig.filter
```

## Validation Rules

- All spring configs: `tension > 0`, `friction > 0`
- All durations: `> 0` normally; clamped to `reduceMotion.maxDuration` when reduce motion on
- Scale values: `0 < scale <= 2.0`
- Stagger: `staggerDelay >= 0`, `maxStaggerItems >= 1`
- Badge bounce triggers only on count increase (not decrease or equal)

## State Transitions

### Panel Animation

```
CLOSED → (tap FAB) → OPENING → OPEN
OPEN → (swipe >40% / tap dismiss) → CLOSING → CLOSED
OPENING → (interrupt) → CLOSING → CLOSED
CLOSING → (interrupt) → OPENING → OPEN
```

### Tab Animation

```
IDLE → (tab switch) → FADE_OUT → SWITCH_CONTENT → STAGGER_IN → IDLE
FADE_OUT → (interrupt) → reset → FADE_OUT (new target)
STAGGER_IN → (interrupt) → skip to final state → IDLE
```

### FAB Breathing

```
IDLE (breathing) → (touch) → PAUSED → (release) → RESUME → IDLE (breathing)
IDLE (breathing) → (panel open) → HIDDEN → (panel close) → IDLE (breathing)
```
