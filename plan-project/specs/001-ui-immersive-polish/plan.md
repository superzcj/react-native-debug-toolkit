# Implementation Plan: UI Immersive Polish & Animation Enhancement

**Branch**: `001-ui-immersive-polish` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `plan-project/specs/001-ui-immersive-polish/spec.md`

## Summary

Polish the debug toolkit's UI with immersive animations: spring-driven panel open/close with backdrop, staggered tab switching reveals, log item expand/collapse with micro-interactions, FAB idle breathing + badge bounce, and animated search/filter. All using RN's built-in `Animated` API with native driver. Must respect system Reduce Motion preference.

## Technical Context

**Language/Version**: TypeScript 5.5+, React 18.3, React Native 0.76.6 (peer >=0.72)

**Primary Dependencies**: `@babel/runtime` (only runtime dep). No external animation libraries — all animations use RN built-in `Animated` API. Peer deps: `@react-native-clipboard/clipboard`, `@react-native-async-storage/async-storage`, `react-native-mmkv`.

**Storage**: N/A (no persistence for animation state)

**Testing**: Jest 30.3 + ts-jest, node environment, custom RN mock at `src/__tests__/helpers/react-native.mock.js`. ~23 test files. No E2E/Detox.

**Target Platform**: iOS 12+, Android API 23+ (minSdk 23)

**Project Type**: Publishable NPM library (react-native-builder-bob, commonjs + ESM + TypeScript outputs)

**Performance Goals**: 60fps all animations on mid-range devices, panel open/close 300-500ms, tab switch 400ms for 10 visible items

**Constraints**: `useNativeDriver: true` for transform/opacity only; JS driver for height/layout; Reduce Motion accessibility; no external animation deps

**Scale/Scope**: ~12 features/tabs, single FAB, one panel instance. Library consumed by host apps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a template — no real principles defined. **PASS** (no gates to violate).

## Project Structure

### Documentation (this feature)

```text
plan-project/specs/001-ui-immersive-polish/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (N/A — library, no external API)
```

### Source Code (repository root)

```text
src/
├── ui/
│   ├── floating/
│   │   └── FloatIcon.tsx            # FAB — add breathing pulse, badge bounce
│   ├── panel/
│   │   ├── FloatPanelView.tsx       # Orchestrator — add backdrop overlay
│   │   ├── DebugPanel.tsx           # Panel — enhance spring, add backdrop
│   │   ├── FeatureRail.tsx          # Tab rail — enhance transition
│   │   ├── FeatureIntroCard.tsx     # Header bar — animated search reveal
│   │   └── useTabAnimation.ts       # Tab switch — staggered content reveal
│   ├── shared/
│   │   ├── CollapsibleSection.tsx   # Expand — add scale pulse, spring height
│   │   ├── useSlideDetailAnimation.ts # Slide detail — enhance spring params
│   │   └── LogListScreen.tsx        # List — staggered item animations
│   └── theme/
│       └── colors.ts                # Dark theme tokens
├── hooks/
│   └── useReduceMotion.ts           # NEW — accessibility hook
├── constants/
│   └── animationConfig.ts           # NEW — central animation timing config
└── __tests__/
    └── ui/                          # Animation-related tests
```

**Structure Decision**: Extends existing `src/ui/` structure. New files: `useReduceMotion.ts` hook, `animationConfig.ts` constants. No structural changes needed.

## Complexity Tracking

No constitution violations. Table empty.
