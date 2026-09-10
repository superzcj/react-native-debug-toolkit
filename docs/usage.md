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

Record business events and inspect them in **Track**:

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

## Other integrations

| Feature | Integration |
| --- | --- |
| Navigation | Pass the same `navigationRef` to `DebugView` and React Navigation, or call `addNavigationLog` |
| Environment | Supply `environments`; configured hosts or URL prefixes are rewritten on subsequent requests. [Types](../src/types/environment.ts) |
| Test accounts | Add the feature returned by `useQuickAccountsFeature` to `customFeatures`; your `onSwitch` owns authentication. [API](../src/index.ts) |
| Sessions | Retains Network, Console, Native and Track in Toolkit-owned MMKV; default five sessions |

## Capture limits

- Network observes RN XHR after initialization. Text/JSON bodies are inspectable; some fetch implementations expose Blob metadata. Native clients that bypass XHR are outside this path.
- Console captures JS output. Native captures iOS `RCTLog*` or Android logcat visible to the app process.
- State, navigation and business events need the integrations above. The Demo uses React state with explicit state logging.
