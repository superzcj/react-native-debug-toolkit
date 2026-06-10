# Feature Specification: UI Immersive Polish & Animation Enhancement

**Feature Branch**: `001-ui-immersive-polish`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "优化工具的UI，更易用，更有沉浸感，可以用一些动画特效"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Smooth Panel Open/Close Experience (Priority: P1)

Developer taps the floating debug button and the panel slides up with a fluid, spring-driven animation. Tapping dismiss or swiping down closes it with a matching ease-out. The animation feels native — not janky, not slow — matching platform conventions (iOS spring, Material motion).

**Why this priority**: Panel open/close is the single most frequent interaction. A polished entry/exit sets the tone for the entire tool. Current implementation already has spring animation but lacks visual polish — no backdrop blur, no shadow depth, no scale micro-interaction on the FAB.

**Independent Test**: Can be fully tested by opening and closing the panel 10 times rapidly and verifying smooth, jank-free animation with visual depth cues (shadow, backdrop).

**Acceptance Scenarios**:

1. **Given** the debug panel is closed, **When** user taps the FAB, **Then** the panel slides up with a spring animation (tension ≥ 80, friction ≤ 12), a semi-transparent backdrop fades in behind it, and the FAB scales down to 0.85 before the panel fully opens
2. **Given** the debug panel is open, **When** user swipes down past the 40% threshold, **Then** the panel dismisses with a velocity-matched animation and the backdrop fades out simultaneously
3. **Given** the debug panel is mid-animation, **When** user taps dismiss, **Then** the current animation is interrupted and reverses smoothly without visual glitch

---

### User Story 2 - Tab Switching with Staggered Content Reveal (Priority: P1)

Developer switches between debug tabs (Network, Console, Native, etc.) and the content area transitions with a staggered fade+slide animation. The new tab's header appears first, followed by the list items fading in sequentially (top to bottom, ~30ms stagger). This creates a sense of content "pouring in" rather than abruptly swapping.

**Why this priority**: Tab switching is the second most frequent interaction. Staggered reveals are a proven technique for perceived performance — users feel the app is responsive even during data loading. Current tab switch is a simple cross-fade.

**Independent Test**: Can be tested by rapidly switching between 3+ tabs and verifying each content area animates with a stagger pattern, not an instant swap.

**Acceptance Scenarios**:

1. **Given** the user is on the Network tab, **When** they tap the Console tab in the FeatureRail, **Then** the Network content fades out (150ms), then the Console header slides in from top, followed by log items staggering in top-to-bottom with 30ms delay between each
2. **Given** a tab has 50+ log items, **When** switching to that tab, **Then** only visible items animate in (virtualized), maintaining 60fps
3. **Given** the user switches tabs rapidly (under 200ms between taps), **Then** previous animation is cancelled cleanly and the final target tab renders without visual artifacts

---

### User Story 3 - Log Item Expand/Collapse with Haptic-Like Feedback (Priority: P2)

Developer taps a log item to expand its details. The item expands with a smooth height animation, and the detail content (JSON body, headers, etc.) fades in with a slight delay. Collapsing reverses the animation. The tap target provides visual feedback — a brief scale pulse (1.0 → 1.02 → 1.0) and subtle highlight ripple.

**Why this priority**: Expanding log items is the primary data-inspection action. Smooth expand/collapse makes browsing large datasets feel precise and responsive. Currently uses `CollapsibleSection` with basic height animation.

**Independent Test**: Can be tested by expanding/collapsing 10 different log items and verifying consistent animation timing, no layout jumps, and visible tap feedback.

**Acceptance Scenarios**:

1. **Given** a network log item is collapsed, **When** user taps it, **Then** the item scales to 1.02 and back (100ms), then the detail section expands with a spring animation, and the JSON content fades in after a 50ms delay
2. **Given** a log item is expanded showing full JSON, **When** user taps the same item, **Then** the JSON fades out first (100ms), then the section collapses with matching spring animation
3. **Given** multiple items are expanded, **When** user scrolls the list, **Then** expanded items do not cause layout thrashing or frame drops

---

### User Story 4 - FAB Floating Experience & Idle Animation (Priority: P2)

The floating action button (FAB) feels alive — it has a subtle breathing pulse when idle (gentle scale oscillation between 0.97-1.0, 3s cycle), a splash effect on press, and a magnetic snap-to-edge animation when released after dragging. When new logs arrive, the badge count updates with a flip/bounce micro-animation.

**Why this priority**: The FAB is the always-visible entry point. Making it feel alive encourages engagement and signals that the debug tool is actively monitoring. Current FAB has basic drag and snap but no idle animation or badge animation.

**Independent Test**: Can be tested by observing the FAB for 10 seconds while idle (breathing animation), dragging and releasing (magnetic snap), and triggering new logs (badge bounce).

**Acceptance Scenarios**:

1. **Given** the debug panel is closed and no interaction for 3 seconds, **When** the FAB is idle, **Then** it continuously pulses between scale 0.97 and 1.0 on a 3-second sine wave cycle
2. **Given** the FAB is being dragged, **When** user releases it, **Then** it snaps to the nearest screen edge with a spring animation (slight overshoot past edge, then settle)
3. **Given** the FAB shows a badge count of 5, **When** 3 new logs arrive, **Then** the badge updates to 8 with a brief scale bounce (1.0 → 1.3 → 1.0, 200ms)

---

### User Story 5 - Search and Filter with Animated Transitions (Priority: P3)

Developer opens the search/filter panel within a tab. The search bar slides down from the header with a smooth animation, and as they type, filtered results animate — matching items stay in place while non-matching items fade out and the list collapses to remove gaps. Clearing search reverses the animation.

**Why this priority**: Search/filter is important for usability but less frequently used than panel open/close and tab switching. Animating filter results reduces cognitive load by showing what changed.

**Independent Test**: Can be tested by typing a search query and verifying that non-matching items fade out smoothly, and clearing the query brings them back with matching animation.

**Acceptance Scenarios**:

1. **Given** the user is on the Console tab, **When** they tap the search icon, **Then** a search bar slides down from the header (200ms) and the keyboard appears
2. **Given** the search bar is active with query "error", **When** matching results update, **Then** non-matching items fade out (150ms) and the list smoothly collapses gaps
3. **Given** search results are filtered, **When** user clears the query, **Then** hidden items fade back in with staggered timing and the search bar slides up

---

### Edge Cases

- What happens when 60fps cannot be maintained during staggered animations? System should fall back to simpler animations (fade only) automatically
- How does the FAB idle animation behave when the panel is open? FAB should be hidden when panel is open; idle animation pauses
- What happens when animations are interrupted by app backgrounding? Animations should complete or cancel cleanly on app state change
- How do animations behave on low-end devices? Animations should use `useNativeDriver: true` to stay off JS thread

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Panel open animation MUST include a spring-driven slide-up with semi-transparent backdrop overlay that fades in simultaneously
- **FR-002**: Panel close animation MUST support both tap-dismiss and swipe-down gesture with velocity-matched dismissal
- **FR-003**: FAB MUST display a continuous breathing pulse animation (scale 0.97-1.0, 3s cycle) when the debug panel is closed and no touch is active
- **FR-004**: FAB MUST animate badge count updates with a scale bounce micro-animation (1.0 → 1.3 → 1.0, 200ms)
- **FR-005**: Tab switching MUST use a staggered content reveal animation — header first, then list items with 30ms stagger delay
- **FR-006**: Tab switching animation MUST cancel cleanly when interrupted by rapid tab changes
- **FR-007**: Log item expand MUST include a scale pulse tap feedback (1.0 → 1.02 → 1.0, 100ms) before the detail section animates open
- **FR-008**: Log item detail content MUST fade in with a 50ms delay after the expand animation begins
- **FR-009**: Log item collapse MUST reverse the expand animation — content fades out first, then section height animates closed
- **FR-010**: All animations MUST use the native animation driver where supported (transform, opacity); height and layout animations MAY use the JS driver where native driver is unavailable
- **FR-011**: Search/filter activation MUST animate the search bar sliding down from the header
- **FR-012**: Filtered list results MUST animate non-matching items fading out and gaps collapsing smoothly
- **FR-013**: FAB drag release MUST snap to the nearest horizontal screen edge with spring overshoot
- **FR-014**: All animations MUST respect the system "Reduce Motion" accessibility setting — when enabled, spring and stagger animations MUST be replaced with simple fade transitions (duration ≤ 200ms)

### Key Entities

- **AnimationConfig**: Timing parameters (duration, delay, spring tension/friction), stagger intervals, scale ranges — defines the feel of each animation
- **AnimationState**: Current animation phase (idle, entering, active, exiting), interrupt flag, current progress — tracks runtime animation state
- **MicroInteraction**: Tap feedback, badge bounce, FAB pulse — small reusable animation primitives triggered by user actions

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All panel open/close animations complete within 300-500ms, feeling instant but not abrupt
- **SC-002**: Tab switching content reveal completes within 400ms for the first 10 visible items, maintaining perceived responsiveness
- **SC-003**: FAB idle breathing animation runs continuously without causing measurable battery drain (CPU usage < 0.1% when idle)
- **SC-004**: All animations maintain 60fps on mid-range devices (measured via performance monitor), with no visible frame drops during normal debug usage
- **SC-005**: Users can switch between 3+ tabs within 2 seconds without visual glitches or stuck animations
- **SC-006**: Log item expand/collapse animation timing feels consistent across all item types (network logs, console logs, native logs)

## Clarifications

### Session 2026-06-10

- Q: FR-010 says all animations MUST use native driver, but height animations can't use native driver in RN's Animated API. How to resolve? → A: Native driver for transform+opacity, JS driver for height/layout only
- Q: Should the debug toolkit respect system "Reduce Motion" accessibility preferences? → A: Yes — replace spring/stagger with simple fade transitions when reduce-motion is enabled

## Assumptions

- All animations use React Native's built-in `Animated` API with `useNativeDriver: true`; no external animation libraries (e.g., react-native-reanimated) are introduced to minimize dependency footprint
- The tool targets React Native 0.72+ which supports `useNativeDriver` for transform and opacity properties; layout animations (height) will use JS-driven animation where native driver is unavailable
- Dark theme only — all animation colors and effects are designed for dark backgrounds (semi-transparent overlays, glow effects)
- The debug toolkit runs in development builds only — production performance impact is not a concern
- Existing animation hooks (`useTabAnimation`, `useSlideDetailAnimation`) will be extended rather than replaced
- Badge count animation applies to the FAB badge only, not to the FeatureRail count pills (those can use simpler fade transitions)
