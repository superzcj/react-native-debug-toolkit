# Configuration reference

[Integration](integration.md) · [中文](configuration.zh-CN.md) · [Runnable example](examples/integration/App.tsx)

Use `withDebugToolkit(App, config?)` at module scope. Configuration is fixed for that mounted host; update business data through sources. Import `DebugToolkitConfig` from `react-native-debug-toolkit` and use `satisfies` to check standalone config objects.

## Shared rules

All twelve features are objects. Omission and `{}` register the page with defaults; missing business data shows an ordinary empty state. No subscriptions or account/environment actions are invented to fill it. Only `{ enabled: false }` removes a feature page and its collection/subscriptions/background tasks. Top-level `enabled: false` disables the entire toolkit without runtime storage/collection work. Runtime disabling does not remove JS or native dependencies from the build.

Top-level `enabled?: boolean` defaults to the native Debug build flag, then the JS development flag if native build detection is unavailable. Release is disabled by default. Explicitly enabled Release never automatically discovers or uploads to a Hub; use Connect's Upload Once or Start Live Logs. `locale?: 'en' | 'zh-CN'` defaults to device language detection with English fallback. Omit it for automatic language; `auto` is not an accepted config value.

Arrays replace defaults; fields are not deep-merged. `undefined` is omission; `null` is only valid where explicitly stated. Wrong types, unknown fields, invalid numbers, duplicate IDs and malformed supplied records produce field-path errors. Invalid global config stops the toolkit; invalid feature config leaves its page showing the error and isolates its behavior. Empty, unavailable and error are distinct states.

The following parser-default column uses JSON, with `undefined` for an absent value. It is checked directly against the parser metadata; the environment normalized default `null` is not a valid explicit input. All fields are optional.

| Field | Parser default | Type and behavior |
| --- | --- | --- |
| `network.enabled` | `true` | boolean; register page and XHR collector. |
| `network.maxLogs` | `200` | Positive safe integer; in-memory record limit. |
| `network.excludeUrls` | `[]` | readonly (string or RegExp)[]; strings match URL substrings. |
| `console.enabled` | `true` | boolean; page and JS console capture. |
| `console.maxLogs` | `200` | Positive safe integer; in-memory limit. |
| `native.enabled` | `true` | boolean; page and supported native collection. |
| `native.maxLogs` | `200` | Positive safe integer; in-memory limit. |
| `native.minLevel` | `undefined` | trace/debug/info/warn/error/fatal/unknown; omitted means no configured level filter. |
| `native.includeTags` | `[]` | readonly string[]; empty means no include restriction. |
| `native.excludeTags` | `[]` | readonly string[]; exclude matching tags. |
| `native.pollIntervalMs` | `500` | Safe integer >=100; polling interval in milliseconds. |
| `state.enabled` | `true` | boolean; page, adapter subscriptions and explicit state recording. |
| `state.maxLogs` | `200` | Positive safe integer; in-memory limit. |
| `state.adapters` | `[]` | readonly StateAdapter[]; each has unique non-empty id, getSnapshot and subscribe. |
| `navigation.enabled` | `true` | boolean; page, ref observation and explicit navigation events. |
| `navigation.maxLogs` | `200` | Positive safe integer; in-memory limit. |
| `navigation.ref` | `undefined` | { current: DebugNavigationRef or null }; share the actual navigation root ref. |
| `track.enabled` | `true` | boolean; page and explicit analytics events. |
| `track.maxLogs` | `200` | Positive safe integer; in-memory limit. |
| `connect.enabled` | `true` | boolean; page, discovery and upload tasks. |
| `connect.appId` | `undefined` | string; otherwise use nativeApplicationId. Missing native identity makes Connect unavailable. |
| `connect.endpoint` | `undefined` | string; explicit Hub HTTP(S) address. A saved manual address takes precedence. |
| `clipboard.enabled` | `true` | boolean; text page and copyToComputer action; no clipboard polling. |
| `history.enabled` | `true` | boolean; historical log disk reads/writes and page. Preferences are separate. |
| `history.maxSessions` | `5` | Positive safe integer; maximum retained sessions. |
| `environment.enabled` | `true` | boolean; page and owner-scoped URL rewriting. |
| `environment.items` | `[]` | readonly DebugEnvironment[]; id, title, urls required on each item. |
| `environment.defaultId` | `null` | Optional string input; no items normalizes to null; with items defaults to first id. |
| `environment.onChange` | `undefined` | (environment) => void or Promise<void>; also runs for restored initial selection. |
| `accounts.enabled` | `true` | boolean; account page, source and switching. |
| `accounts.items` | `[]` | readonly A[]; id/title required, subtitle/note optional; mutually exclusive with source. |
| `accounts.currentId` | `undefined` | string or null; actual business identity, not recent-choice inference. |
| `accounts.scopeKey` | `"default"` | string; isolates recent account IDs by business context. |
| `accounts.contextLabel` | `undefined` | string; business context label. |
| `accounts.isAuthenticated` | `undefined` | boolean; omitted means unknown authentication state. |
| `accounts.currentDetails` | `undefined` | readonly { title: string, value: string }[]; explicit display fields. |
| `accounts.source` | `undefined` | DebugSource<AccountsSnapshot<A>>; replaces ALL six static account data fields. |
| `accounts.onSwitch` | `undefined` | (account, { signal }) => void or Promise<void>; owns business authentication. |
| `accounts.onRollback` | `undefined` | (account, { reason, error? }) => void or Promise<void>; reason is error or superseded. |
| `accounts.onSuccess` | `undefined` | (account) => void or Promise<void>; after successful commit only. |
| `accounts.onError` | `undefined` | (error, account) => void or Promise<void>; reports switch failure. |
| `accounts.closeOnSuccess` | `true` | boolean; close panel after successful switching. |
| `tabs.enabled` | `true` | boolean; fixed Custom page and configured item lifetimes. |
| `tabs.items` | `[]` | readonly typed DebugTab tuple; id/title/component required per item. |

## Quick actions

Configure up to five business actions on the floating launcher, without adding feature pages:

```tsx
quickActions: {
  items: [
    { id: 'reset-cart', title: 'Reset cart', icon: '↺', onPress: () => cart.reset() },
    { id: 'refresh', title: 'Refresh', onPress: async () => refreshData() },
  ],
}
```

Hold the launcher for about 450 ms to expand an inward radial menu. Moving cancels the hold and drags the launcher; releasing after expansion leaves the menu open. Tap an action to execute it. Tap the center, backdrop, or Android back to close. Screen readers can invoke the “Open quick actions” accessibility action. Character icons and React elements are supported.

Each action requires a unique non-empty `id`, non-empty `title`, and `onPress` function. Optional `disabled` prevents invocation. `closeOnPress` defaults to true: the closing animation finishes and the overlay is removed before invoking the callback. Set it to false to keep the menu open, with a real loading indicator and transient success/error feedback. An unfinished action cannot be started again, even after reopening the menu. The fixed configuration lives for the host lifetime; read current data from your own store/ref inside the callback instead of capturing stale values. Invalid configuration produces global issues with field paths.

Insufficient space falls back to a scrollable grid with a close button and full-size touch targets. Radial bounds include labels and hit areas. iOS measures the core SafeAreaView content area; Android uses the host's available area and does not read system WindowInsets, so mount the toolkit in safe content bounds for edge-to-edge layouts. System reduced-motion settings are respected. No whole-device vibration is triggered.

## Default pages and capture

Network captures React Native XHR requests after initialization; native clients bypassing XHR are outside its scope. Text/JSON responses are inspectable; a fetch implementation may expose only Blob metadata. Console observes JS console output. Native uses supported iOS RCTLog output or Android process-visible logcat; unavailable native capture is shown honestly.

State is empty without adapters or explicit events; Navigation is empty without a ref or explicit events; Track is empty until instrumented. Accounts, Environment and Custom stay visible with empty lists. Clipboard waits for user action. History shows retained supported logs if available. Connect resolves the native app identifier and, in Debug, can discover/upload when the Hub is reachable; an offline Hub does not stop the app.

## Sources, state and navigation

`DebugSource<T>` is `{ getSnapshot(): T; subscribe(listener: () => void): () => void }`. Reads must be side-effect free and return the same reference until a real change. On change, store a new snapshot first, then notify listeners. Return an unsubscribe function; subscriptions are released with their runtime lifetime, cancellation or failure. Keep config, source and account-item references stable. The [complete store example](examples/integration/source.ts) demonstrates this without another state library.

A StateAdapter adds `id`. It observes initial and subsequent snapshots, recording subscription changes as `change`; it cannot infer business action names. Optional `zustandAdapter(id, store)` is imported from `react-native-debug-toolkit/adapters/zustand` and accepts the existing store's `getState/subscribe`; the main entry does not import Zustand. Exact actions can be recorded with `debug.state('cart', { action: 'add', before, after })`. Recorded snapshots are sanitized without calling functions/getters; later business mutations cannot rewrite the record.

Navigation accepts the same ref used by the app's actual navigation root. Its `current` may initially be null; a ready instance supplies `getCurrentRoute(): { key?: string; name: string } | undefined`, `getRootState(): unknown`, `addListener('state', listener): () => void`, and optionally `isReady(): boolean`. The toolkit waits, deduplicates routes and removes its listener on cleanup. It does not accept a standalone navigation object or discover arbitrary routers. Other routers can call `debug.navigation({ action: 'navigate', from: 'Home', to: 'Checkout' })`.

## Environments

Each item is `{ id, title, urls: { api: 'https://dev.example.com/api' } }`. Use the same non-empty service keys in every item and absolute HTTP(S) URLs; IDs must be unique, and equal ambiguous prefixes within an environment are rejected. With items, an explicit defaultId must exist. Without items, even a supplied defaultId is a normal empty page and no old selection is applied.

Only requests beginning with a declared default-environment service prefix are rewritten. The longest path-boundary match wins; `/api` does not match `/api2`. Remaining path, query and hash are preserved, unrelated URLs are untouched, and existing requests are unchanged. Network may be disabled while environment rewriting still works.

Switches are serial. `onChange` updates your cached API clients; success persists selection, failure restores the toolkit selection/prefix while your callback owns rollback of its business side effects. Startup restores a still-valid saved selection, otherwise the default, and calls onChange. Recovery failure falls back to default and reports an error. Wait for ready and check Environment's status before starting requests that rely on this callback.

## Accounts

Static data comprises items/currentId/scopeKey/contextLabel/isAuthenticated/currentDetails. A source replaces all six: never supply any of them alongside source. Its snapshot requires items and permits the other five fields. Configuration callbacks remain outside the source. Omitted static items defaults to []; source mode does not inject static defaults into supplied snapshots.

Items alone are viewable, with switching disabled until onSwitch exists. onSwitch alone still yields an empty list. The callback receives the original generic account object, including business fields; only explicitly provided display fields are shown, and whole accounts are not persisted. Without current authentication data, a recent successful selection is not evidence of login.

Switches are serial. Honor `signal.aborted` and pass the signal to cancellable business operations. Scope changes, removal/replacement of the target account object, suspend and disposal invalidate the operation; late results cannot commit recent IDs or success. Feedback changes to currentId/currentDetails/isAuthenticated/contextLabel do not cancel their own switch. Keep unchanged account objects stable.

onRollback can compensate a started operation that fails or becomes superseded; the SDK cannot undo authentication itself. No new switch begins until the old callback and compensation finish. onSuccess failures are notification errors, not a reason to roll back an already committed login. Callback errors remain visible. A business promise that never settles cannot be forcibly cancelled.

`debug.accounts.switchTo(id)` returns success/error/superseded/disabled/busy/not_configured/not_found. `suspend()` blocks new switches and cancels the current one; `resume()` permits new switches; `waitForIdle()` waits for callbacks and compensation, not just signal abortion. Recent-ID hydration for nonempty accounts participates in ready; an empty page does not wait for future accounts.

`debug.environment.switchTo(id)` uses the configured environment controller, so SDK URL rewriting, persisted selection, the launcher badge, and `environment.onChange` stay in sync. An unavailable or disabled environment feature leaves the action inert.

## Custom pages and Context

Each item requires a unique non-empty id/title and component. IDs cannot duplicate another custom item or any built-in key in the table. Item `enabled?: boolean` defaults true. Optional fields: source, badge, onActivate, onDeactivate, onClear. With source, component receives `{ snapshot }` and `badge(snapshot)` returns `{ label: string, color: string } | null`. Without source, component takes no required props and `badge()` takes none. Lifecycle callbacks return void. Activate/deactivate mean runtime activation/release, not switching the selected page.

Use `DebugToolkitConfig<MyAccount, readonly [Snapshot, never]>` for a source-backed item plus a plain component. The [complete config](examples/integration/debug.config.tsx) has typed items/onSwitch and a source-backed custom component, with all imports defined.

The overlay is outside Providers inside App. A custom component does not automatically inherit that Context. The [complete App](examples/integration/App.tsx) uses one external store both for its internal Context Provider and the custom page's source. Business code updates that store; the panel receives its snapshot. Do not create a second authentication Provider in the overlay and expect shared state.

## History, clear and copy

History persists Network, Console, Native and Track only. State and Navigation remain current-session memory. Disk caps per session are Network `min(maxLogs, 30)`, the other three `min(maxLogs, 50)`, newest first, with maxSessions defaulting to five. In-memory maxLogs does not promise equal disk capacity. Disabled History neither reads/writes nor deletes prior log history; current memory and Hub sync still work. A later enabled host can read previously retained history; disabled-period logs are not backfilled. Environment/account preferences are independent.

`debug.clear()` clears current logs; `debug.clear(feature)` accepts only network/console/native/state/navigation/track. It does not reset environments, accounts or historical sessions. `debug.getReport()` returns current status/features/logs and available appId/sessionId; it does not start a host. `debug.open()/close()` control the panel.

`await debug.copyToComputer(text, { label })` returns status completed or disabled, plus independent phone/console/hub results (success/unavailable/disabled/error, optional reason). Completed does not mean all channels succeeded. Phone success means the linked optional clipboard module wrote locally. Console success means a local Console record exists. Hub success means the existing event protocol acknowledged that event, not that the computer clipboard changed. Inspect/copy the text in the Hub Console. Console or Connect being off disables its path; missing native clipboard affects only phone. A disconnected Hub is unavailable; failed delivery is error. Paused copy uploads only the explicit copy, not unrelated paused logs; blocked sequence delivery may return an error until you resume and retry. Global or Clipboard disable performs no copying or logging.

## Initialization and errors

`debug.ready()` resolves a structured result: ready/partial/disabled/not_started/cancelled/initialization_timeout/error, with per-feature initializing/ready/empty/unavailable/error and field-path issues. Empty business features are normal. Local initialization has a 10-second deadline; it does not wait for an online Hub or future business data.

Wait in an ordinary React useEffect or a user action after mounting. The HOC registers readiness in its layout effect; module scope, render and child layout effects before it are not valid waiting points. Unmounted calls return not_started; disposal cancels pending readiness. Only one host may be mounted per JS runtime; keep HOC creation at module scope and update an existing wrapper instead of adding a second one.

Explicit track/state/navigation calls before feature readiness or after disable are no-ops and are not replayed. XHR and console capture start after their setup; ready does not recover module-import, render or earlier network events. A ready result reports initialization, while later source errors are visible in feature statuses. Native storage failure can leave live memory capture working but History unavailable and preferences unsaved; it does not remove the native installation requirement.
