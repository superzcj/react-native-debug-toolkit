# Feature examples

[Quick start](../README.md) · [中文](usage.zh-CN.md) · [Demo](../Demo/README.md)

## Capture settings

Mount `DebugView` once. Most built-in features are enabled by default; configure limits or disable optional tools:

```tsx
<DebugView
  features={{
    network: { maxLogs: 100, blacklist: ['/health', /analytics\.example\.com/] },
    console: { maxLogs: 200 },
    native: { minLevel: 'warn' },
    clipboard: false,
  }}
>
  <AppContent />
</DebugView>
```

## Language

Choose the inspector language when mounting it:

```tsx
<DebugView locale="zh-CN">
  <AppContent />
</DebugView>
```

If you initialize the toolkit manually, pass the same option:

```ts
await initializeDebugToolkit({ locale: 'zh-CN' });
```

Supported values are `auto` (default), `en` and `zh-CN`. `auto` checks the device language at initialization, uses Simplified Chinese when supported, and falls back to English otherwise. Reload the app after changing this configuration. Custom tab labels, account/environment names and raw logs are kept as supplied.

The Web Console has its own startup setting:

```sh
npx --package=react-native-debug-toolkit debug-toolkit hub dev --locale zh-CN
```

`hub start` accepts the same flag. You can also set `DEBUG_TOOLKIT_HUB_LOCALE=zh-CN`; the explicit flag takes priority. The default `auto` uses the browser language when the page loads. Restart the Hub after changing its configuration, then reload the page. Phone and browser language settings are independent.

## State and events

For an app using Zustand, save this as `cartStore.ts`:

```tsx
import { create } from 'zustand';
import { zustandLogMiddleware } from 'react-native-debug-toolkit';

type CartState = { count: number; add: () => void };

export const useCart = create<CartState>(
  zustandLogMiddleware<CartState>((set) => ({
    count: 0,
    add: () => set((state) => ({ count: state.count + 1 }), false, 'cart/add'),
  })),
);
```

Call `useCart.getState().add()` and open **State** to see the action and before/after values. The middleware observes its wrapped `set`; for other state systems, call `addZustandLog` explicitly.

Instrument analytics events and inspect their names, properties and timestamps in **Track**:

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({
  eventName: 'checkout_failed',
  productId: 'linen-chair',
  reason: 'inventory_conflict',
});
```

## Custom tabs

Use the cart store above to add a live business snapshot:

```tsx
import React from 'react';
import { Text, View } from 'react-native';
import { DebugView, createDebugTab, type DebugFeatureRenderProps } from 'react-native-debug-toolkit';
import { useCart } from './cartStore'; // The store defined in the Zustand example.

type CartSnapshot = { count: number };

function CartTab({ snapshot }: DebugFeatureRenderProps<CartSnapshot>) {
  return <View style={{ padding: 16 }}><Text>Items: {snapshot.count}</Text></View>;
}

const cartTab = createDebugTab<CartSnapshot>({
  name: 'cart',
  label: 'My Cart',
  getSnapshot: () => ({ count: useCart.getState().count }),
  subscribe: (listener) => useCart.subscribe(() => listener()),
  render: CartTab,
  badge: () => ({ label: String(useCart.getState().count), color: '#28856A' }),
});

export function App() {
  return <DebugView customFeatures={[cartTab]}><AppContent /></DebugView>;
}
```

Define the feature once. `name` must be unique; `subscribe` returns an unsubscribe callback. Custom React tabs are displayed inside the app.

## Environment switching

```tsx
<DebugView environments={[
  { id: 'dev', label: 'Development', host: 'dev.example.com' },
  { id: 'staging', label: 'Staging', host: 'staging.example.com' },
]}>
  <AppContent />
</DebugView>
```

Replace the hosts with reachable services. A host may include a port, without a scheme or path. Choose in Env to rewrite matching hosts on subsequent requests while preserving the scheme/path; the selection is persisted. Object configuration supports named URL prefixes and `onChange`; managed mode prompts for an app restart. [Types](../src/types/environment.ts)

## Phone → Mac text sharing

Enter or paste text in **Clip** and tap **Copy**, or call:

```tsx
import { copyToComputer } from 'react-native-debug-toolkit';

copyToComputer('Checkout reproduced on staging.', { label: 'Diagnostic note' });
```

Text is logged to Console by default. With Hub connected, view and copy it in the Mac browser Console. Installing/linking optional `@react-native-clipboard/clipboard` also writes to the device clipboard. This sends text from the phone to the computer; `silent: true` only writes the clipboard and skips log sync.

## Log sync

Configure `features.devConnect.appId` and start the Hub. Debug syncs automatically. In an explicitly enabled internal/Release build, use **Upload Once** or **Start/Stop Live Logs** in Connect. Filter by device, log type and keyword in the Hub. Network, Console, Native, State, Navigation and Track records are synchronized; custom React panels remain in the app.

## Other integrations

| Feature | Integration |
| --- | --- |
| Navigation | Pass the same `navigationRef` to `DebugView` and React Navigation, or call `addNavigationLog` |
| Test accounts | Add the feature returned by `useQuickAccountsFeature` to `customFeatures`; your `onSwitch` owns authentication. [API](../src/index.ts) |
| Sessions | Retains Network, Console, Native and Track in Toolkit-owned MMKV; default five sessions |

## Capture limits

- Network observes RN XHR after initialization. Text/JSON bodies are inspectable; some fetch implementations expose Blob metadata. Native clients that bypass XHR are outside this path.
- Console captures JS output. Native captures iOS `RCTLog*` or Android logcat visible to the app process.
- State, navigation and business events need the integrations above. The Demo uses React state with explicit state logging.
