# React Native Debug Toolkit

[English](README.md)

一个仅用于开发的 React Native 浮动调试面板 — 在设备上直接查看网络请求、控制台日志、状态变化、导航事件等。

> 生产环境零影响（仅在 `__DEV__` 模式下运行）。

## 预览

![demo](demo.gif)
## 功能

- **Network** — 自动拦截 React Native XHR 传输层，默认覆盖 fetch 和使用默认 adapter 的 axios，可查看请求与响应并复制为 cURL
- **Console** — 捕获 `console.log / info / warn / error`
- **Zustand** — 通过中间件记录状态变化
- **Navigation** — 追踪路由切换
- **Track** — 记录自定义埋点事件
- **Environment** — 运行时切换 API 环境
- **Clipboard** — 粘贴文本并复制到电脑
- **日志持久化** — Network、Console、Track 日志在应用重启后保留（需要 AsyncStorage）

## 安装

```bash
npm install react-native-debug-toolkit
```

可选 — 剪贴板复制支持：

```bash
npm install @react-native-clipboard/clipboard
```

可选 — FAB 位置与上次 Tab 持久化：

```bash
npm install @react-native-async-storage/async-storage
```

未安装 AsyncStorage 时，这些功能会优雅降级为内存态。

## 快速开始

```tsx
import { DebugView } from 'react-native-debug-toolkit';

function App() {
  return (
    <DebugView>
      <AppContent />
    </DebugView>
  );
}
```

开发模式下出现浮动调试按钮。点击打开面板，点击 × 或下滑关闭。

网络、控制台、导航、Zustand、埋点和剪贴板默认启用。Network 会拦截 React Native 的 XHR 传输层，因此使用默认 adapter 的 fetch 和 axios 请求会自动被捕获。

禁用特定功能：

```tsx
<DebugView features={{ clipboard: false, zustand: false }}>
  <AppContent />
</DebugView>
```

## 常用模式

### 导航追踪

```tsx
import { useRef } from 'react';
import { DebugView } from 'react-native-debug-toolkit';
import { NavigationContainer } from '@react-navigation/native';

function App() {
  const navRef = useRef(null);
  return (
    <DebugView navigationRef={navRef}>
      <NavigationContainer ref={navRef}>
        <AppContent />
      </NavigationContainer>
    </DebugView>
  );
}
```

### 环境切换

```tsx
<DebugView
  environments={[
    { id: 'dev',  label: 'Dev',  host: 'dev-api.example.com', color: '#34C759' },
    { id: 'prod', label: 'Prod', host: 'api.example.com',     color: '#FF3B30' },
  ]}
>
  <AppContent />
</DebugView>
```

### Zustand 中间件

```tsx
import { zustandLogMiddleware } from 'react-native-debug-toolkit';

const useStore = create(
  zustandLogMiddleware((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 }), false, 'increment'),
    //                          ↑ merge  ↑ action 名称（显示在调试面板）
  }))
);
```

### 自定义事件

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({ eventName: 'button_click', buttonId: 'submit' });
```

### 网络配置

React Native fetch 和 axios 流量会通过 XHR 传输层自动捕获。

```tsx
<DebugView
  features={{
    network: {
      maxLogs: 100,
      blacklist: ['/analytics', /\/healthcheck$/],
    },
  }}
>
  <AppContent />
</DebugView>
```

## 命令式 API

用于 React 外部的编程控制（通知、深度链接、开发专用按钮）：

```tsx
import { DebugToolkit } from 'react-native-debug-toolkit';

DebugToolkit.openPanel();
DebugToolkit.clearAll();
DebugToolkit.showLauncher();
DebugToolkit.hideLauncher();
```

完整 API：`DebugToolkit` 是单例，提供 `openPanel`、`closePanel`、`togglePanel`、`clearAll`、`showLauncher`、`hideLauncher`、`addFeature`、`removeFeature`、`destroy`、`features`、`panelOpen`。详见 TypeScript 类型定义。

## 对等依赖

| 包 | 版本 | 必需 |
|----|------|------|
| react | >= 18.0.0 | 是 |
| react-native | >= 0.72.0 | 是 |
| @react-native-clipboard/clipboard | >= 1.0.0 | 否 |
| @react-native-async-storage/async-storage | >= 1.0.0 | 否 |

## 许可证

MIT
