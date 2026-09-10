# 功能示例

[快速接入](../README.zh-CN.md) · [English](usage.md) · [Demo](../Demo/README.md)

## 采集配置

只挂载一次 `DebugView`。大部分内置功能默认开启，可限制数量或关闭可选工具：

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

## 状态与埋点

使用 Zustand 的项目可将以下代码保存为 `cartStore.ts`：

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

调用 `useCart.getState().add()`，在 **State** 查看动作和前后状态。中间件观察包装后的 `set`；其他状态方案可显式调用 `addZustandLog`。

记录业务事件，在 **Track** 中查看：

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({
  eventName: 'checkout_failed',
  productId: 'linen-chair',
  reason: 'inventory_conflict',
});
```

## 自定义 Tab

接上方购物车 store，展示实时业务快照：

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

feature 定义一次即可；`name` 保持唯一，`subscribe` 返回取消订阅函数。自定义 React Tab 显示在 App 内。

## 其他接入

| 功能 | 接入方式 |
| --- | --- |
| 导航 | `DebugView` 与 React Navigation 共用 `navigationRef`，或调用 `addNavigationLog` |
| 环境切换 | 提供 `environments`，后续请求按配置替换 host 或 URL 前缀。[类型](../src/types/environment.ts) |
| 测试账号 | 将 `useQuickAccountsFeature` 返回值加入 `customFeatures`，业务 `onSwitch` 负责认证。[API](../src/index.ts) |
| 历史会话 | 独立 MMKV 保留 Network、Console、Native、Track，默认最多五个会话 |

## 采集范围

- Network 在初始化后观察 RN XHR。text/JSON 正文可直接查看；部分 fetch 实现只提供 Blob 元数据。绕过 XHR 的原生客户端不在此链路内。
- Console 采集 JS 输出；Native 采集 iOS `RCTLog*` 或 Android 当前进程可见的 logcat。
- 状态、导航和埋点需按上方方式接入。Demo 使用 React state 配合显式状态记录。
