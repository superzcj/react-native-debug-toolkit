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

## 界面语言

挂载时配置调试面板的语言：

```tsx
<DebugView locale="zh-CN">
  <AppContent />
</DebugView>
```

手动初始化时传入相同配置：

```ts
await initializeDebugToolkit({ locale: 'zh-CN' });
```

支持 `auto`（默认）、`en` 和 `zh-CN`。`auto` 在初始化时读取设备语言，支持的简体中文环境显示中文，其余情况回退英文。修改配置后重新加载 App 生效。自定义 Tab 标题、账号名、环境名和原始日志保留调用方提供的内容。

Web Console 独立配置语言：

```sh
npx --package=react-native-debug-toolkit debug-toolkit hub dev --locale zh-CN
```

`hub start` 也支持此参数。也可设置环境变量 `DEBUG_TOOLKIT_HUB_LOCALE=zh-CN`，显式参数优先。默认 `auto` 在页面加载时读取浏览器语言。修改配置后重启 Hub 并刷新页面；手机与浏览器的语言配置互不影响。

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

记录埋点，在 **Track** 中核对名称、属性和触发时间：

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

## 环境切换

```tsx
<DebugView environments={[
  { id: 'dev', label: 'Development', host: 'dev.example.com' },
  { id: 'staging', label: 'Staging', host: 'staging.example.com' },
]}>
  <AppContent />
</DebugView>
```

将 host 换成自己的可访问服务，支持端口、不带协议或路径。在 Env 选择后，后续匹配请求会替换 host，原协议和路径保留；选择会持久化。对象配置还支持多组 URL 前缀与 `onChange`，托管模式按界面提示重启 App。[配置类型](../src/types/environment.ts)

## 手机 → Mac 文本传递

在 **Clip** 输入或粘贴文本后点 **Copy**，也可调用：

```tsx
import { copyToComputer } from 'react-native-debug-toolkit';

copyToComputer('Checkout reproduced on staging.', { label: 'Diagnostic note' });
```

默认写入 Console，连接 Hub 后在 Mac 浏览器的 Console 中查看、复制。安装并链接可选 `@react-native-clipboard/clipboard` 时，也会写入手机剪贴板。此入口是手机向电脑传文本；`silent: true` 只写剪贴板，不进入日志同步。

## 日志同步

配置 `features.devConnect.appId` 并启动 Hub。Debug 自动同步；内测/Release 显式启用 Toolkit 后，在 **Connect** 点 **Upload Once** 上传一次，或用 **Start/Stop Live Logs** 控制持续同步。Hub 可按设备、日志类型和关键词筛选。它同步 Network、Console、Native、State、Navigation、Track 等运行记录；自定义 React 面板仍显示在 App 内。

## 其他接入

| 功能 | 接入方式 |
| --- | --- |
| 导航 | `DebugView` 与 React Navigation 共用 `navigationRef`，或调用 `addNavigationLog` |
| 测试账号 | 将 `useQuickAccountsFeature` 返回值加入 `customFeatures`，业务 `onSwitch` 负责认证。[API](../src/index.ts) |
| 历史会话 | 独立 MMKV 保留 Network、Console、Native、Track，默认最多五个会话 |

## 采集范围

- Network 在初始化后观察 RN XHR。text/JSON 正文可直接查看；部分 fetch 实现只提供 Blob 元数据。绕过 XHR 的原生客户端不在此链路内。
- Console 采集 JS 输出；Native 采集 iOS `RCTLog*` 或 Android 当前进程可见的 logcat。
- 状态、导航和埋点需按上方方式接入。Demo 使用 React state 配合显式状态记录。
