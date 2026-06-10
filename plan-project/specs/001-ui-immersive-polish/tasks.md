# Tasks: UI Immersive Polish & Animation Enhancement

**Input**: Design documents from `plan-project/specs/001-ui-immersive-polish/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in spec. Test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared animation constants and accessibility hook used by all user stories.

- [x] T001 Create `src/constants/animationConfig.ts` — all timing constants from data-model.md (panel, tab, fab, badge, logItem, search, filter, reduceMotion sections) + helper to return reduced-motion-aware config
- [x] T002 [P] Create `src/hooks/useReduceMotion.ts` — wraps AccessibilityInfo.isReduceMotionEnabled() + addEventListener('reduceMotionChanged'), returns boolean

---

## Phase 2: User Story 1 - Smooth Panel Open/Close (Priority: P1) - MVP

**Goal**: Panel slides up with spring animation + semi-transparent backdrop. Closes with velocity-matched dismiss. FAB scales down on open.

**Independent Test**: Open/close panel 10x rapidly — verify smooth spring, backdrop visible, no visual glitches.

- [x] T003 [US1] Enhance spring animation in `src/ui/panel/DebugPanel.tsx` — use animationConfig.panel values (friction:10, tension:85), wire useReduceMotion for reduced variant
- [x] T004 [P] [US1] Add semi-transparent backdrop overlay in `src/ui/panel/FloatPanelView.tsx` — Animated.View with animated opacity, 250ms fade-in, 0.5 max opacity, dismiss on tap
- [x] T005 [P] [US1] Add FAB scale-down micro-interaction in `src/ui/floating/FloatIcon.tsx` — animate scale to 0.85 on panel open trigger, restore on close

**Checkpoint**: Panel open/close feels smooth with backdrop depth. MVP deliverable.

---

## Phase 3: User Story 2 - Tab Switching with Staggered Content Reveal (Priority: P1)

**Goal**: Tab content transitions with staggered fade+slide — header first, then list items with 30ms stagger. Interruption-safe.

**Independent Test**: Rapidly switch 3+ tabs — verify stagger pattern, no visual artifacts, final tab renders correctly.

- [x] T006 [US2] Create stagger animation hook in `src/ui/panel/useStaggerAnimation.ts` — per-item Animated.Value map, onViewableItemsChanged trigger, index-based stagger delay (30ms), max 15 items cap
- [x] T007 [US2] Enhance tab switch animation in `src/ui/panel/useTabAnimation.ts` — add staggered content reveal (fade-out 80ms → switch → stagger-in), animation interruption via .stop() + finished callback guard
- [x] T008 [US2] Wire stagger animation to list in `src/ui/shared/LogListScreen.tsx` — integrate useStaggerAnimation hook with FlatList onViewableItemsChanged

**Checkpoint**: Tab switching shows staggered content reveal. Both P1 stories complete.

---

## Phase 4: User Story 3 - Log Item Expand/Collapse with Feedback (Priority: P2)

**Goal**: Log item tap triggers scale pulse (1.02x), then spring height expand, then content fades in (50ms delay). Collapse reverses order.

**Independent Test**: Expand/collapse 10 log items — verify consistent timing, visible tap feedback, no layout jumps.

- [x] T009 [US3] Add scale pulse + spring expand + content fade in `src/ui/shared/CollapsibleSection.tsx` — tap scale 1.0→1.02→1.0 (100ms), LayoutAnimation for height, detail content fade-in with 50ms delay, reverse order on collapse
- [x] T010 [P] [US3] Enhance spring params in `src/ui/shared/useSlideDetailAnimation.ts` — use animationConfig.logItem values (expandFriction:9, expandTension:60)

**Checkpoint**: Log items expand/collapse with smooth animation and tap feedback.

---

## Phase 5: User Story 4 - FAB Floating Experience & Idle Animation (Priority: P2)

**Goal**: FAB breathes when idle (0.97-1.0 scale, 3s cycle), badge bounces on count update, snaps to edge with spring overshoot on drag release.

**Independent Test**: Observe FAB 10s idle (breathing), drag+release (magnetic snap), trigger new logs (badge bounce).

- [x] T011 [US4] Add breathing pulse animation in `src/ui/floating/FloatIcon.tsx` — Animated.loop with Animated.sequence + Easing.inOut(Easing.sin), 1500ms each direction (3s cycle), pause on touch, pause when panel open
- [x] T012 [US4] Add badge count bounce in `src/ui/floating/FloatIcon.tsx` — Animated.sequence of springs (1.0→1.3→1.0, ~200ms), trigger via useEffect comparing prev/current count
- [x] T013 [US4] Add magnetic edge-snap spring in `src/ui/floating/FloatIcon.tsx` — spring animation to nearest horizontal edge with overshoot (friction:7, tension:40), use animationConfig.fab.edgeSnap values

**Checkpoint**: FAB feels alive — breathes, bounces badge, snaps to edges.

---

## Phase 6: User Story 5 - Search/Filter Animated Transitions (Priority: P3)

**Goal**: Search bar slides down on activate. Filtered results animate non-matching items out (fade + gap collapse). Clearing reverses animation.

**Independent Test**: Type search query — verify items fade out smoothly. Clear query — items fade back in.

- [x] T014 [P] [US5] Add animated search bar reveal in `src/ui/panel/FeatureIntroCard.tsx` — search bar slides down from header (200ms), use animationConfig.search.slideDuration
- [x] T015 [US5] Add animated filter transitions in `src/ui/shared/LogListScreen.tsx` — non-matching items fade out (150ms per animationConfig.filter.fadeOutDuration), gaps collapse smoothly, staggered fade-in on clear

**Checkpoint**: Search/filter has smooth animated transitions.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation, accessibility verification, performance audit.

- [x] T016 [P] Verify Reduce Motion integration end-to-end — enable system Reduce Motion setting, confirm all spring/stagger animations replaced with simple fades ≤200ms across all components
- [x] T017 [P] Performance validation — verify native driver on all transform/opacity animations, LayoutAnimation enabled for Android, 60fps target on mid-range devices
- [x] T018 Run quickstart.md validation scenarios V1-V7 — panel spring/backdrop, tab stagger, log expand, FAB breathing/badge, search/filter, reduce motion, 60fps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on T001, T002 (animationConfig + useReduceMotion)
- **US2 (Phase 3)**: Depends on T001 (animationConfig). Can run parallel with US1 (different files)
- **US3 (Phase 4)**: Depends on T001 (animationConfig). Can run parallel with US1/US2
- **US4 (Phase 5)**: Depends on T001, T005 (FloatIcon.tsx — adds to US1's FAB changes)
- **US5 (Phase 6)**: Depends on T001. Can run parallel with US3/US4 (different files except LogListScreen.tsx shared with US2/US3)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 1 only. No other story dependencies.
- **US2 (P1)**: Depends on Phase 1 only. Shares LogListScreen.tsx with US3 — sequential on that file.
- **US3 (P2)**: Depends on Phase 1. Shares CollapsibleSection.tsx (no conflict), LogListScreen.tsx with US2/US5.
- **US4 (P2)**: Depends on Phase 1 + T005 (US1's FloatIcon.tsx changes). Sequential after US1 on FloatIcon.
- **US5 (P3)**: Depends on Phase 1. Shares LogListScreen.tsx with US2/US3.

### Parallel Opportunities

```
Phase 1:  T001 ─┐
               T002 ─┘ (parallel)

Phase 2:  T003 ─┐
               T004 ─┤ (parallel, different files)
               T005 ─┘

Phase 3:  T006 → T007 → T008 (sequential — T007 depends on T006 hook)

Phase 4:  T009 ─┐
               T010 ─┘ (parallel, different files)

Phase 5:  T011 → T012 → T013 (sequential, same file FloatIcon.tsx)

Phase 6:  T014 ─┐
               T015 ─┘ (parallel, different files)

Phase 7:  T016 ─┐
               T017 ─┤ (parallel)
               T018  ─┘ (after T016, T017)
```

### Cross-Story Parallelism

- US1 + US2 can run fully in parallel (no shared files)
- US3 (T010) can run parallel with US1/US2 (useSlideDetailAnimation.ts is unique)
- US4 must wait for US1's T005 (shared FloatIcon.tsx)
- US5 can run parallel with US3/US4 (except LogListScreen.tsx shared)

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: US1 (T003, T004, T005)
3. **STOP and VALIDATE**: Test panel open/close via quickstart V1
4. Demo-ready with polished panel experience

### Incremental Delivery

1. Setup → Foundation ready
2. + US1 → Polished panel (MVP!)
3. + US2 → Staggered tab switching
4. + US3 → Log item expand/collapse feedback
5. + US4 → Alive FAB with breathing + badge
6. + US5 → Animated search/filter
7. + Polish → Production-ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All animations use RN built-in Animated API — no external libraries
- Reduce Motion: animationConfig helper returns capped durations when useReduceMotion() is true
- Native driver: required for transform/opacity; JS driver for height/layout only
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
