# React Native Debug Toolkit

![demo](demo.gif)

[English](README.md)

React Native 开发期本地调试工具。提供 App 内调试面板、桌面 Web Console、本地 HTTP API 和 MCP server，全部在本地运行，不依赖云服务。

```text
RN App -> Debug Panel -> 本地 daemon -> Web Console / HTTP API / MCP
```

## 功能

- App 内调试面板：Network、Console、原生日志(Native)、Navigation、Track、Zustand、Environment、Clipboard，支持自定义 Tab。
- 桌面 Web Console：在浏览器中查看模拟器和真机日志。
- 本地 HTTP API：供 `curl`、脚本、AI Agent（Codex、Claude Code 等）读取日志。
- 可选 MCP server：提供 `list_app_devices` 和 `get_app_logs`。
- 本地优先：不接云服务，不注册，包内不调用 AI API。

## 安装

```bash
npm install react-native-debug-toolkit
```

安装原生部分并重新构建：

```bash
cd ios && pod install
# Android：下次构建时 Gradle autolinking 生效
```

Expo Go 无法加载此原生模块。Expo 项目需用 development build、prebuild 或 bare React Native。

可选依赖：

```bash
npm install @react-native-clipboard/clipboard
npm install @react-native-async-storage/async-storage
```

## 快速开始

用 `DebugView` 包裹 App：

```tsx
import { DebugView } from 'react-native-debug-toolkit';

export function App() {
  return (
    <DebugView>
      <AppContent />
    </DebugView>
  );
}
```

开发模式启动 App，点击 `DBG` 打开调试面板。

启动桌面 daemon：

```bash
npm exec -- debug-toolkit --daemon-only
# 或：npx react-native-debug-toolkit --daemon-only
```

打开 Web Console：

```text
http://127.0.0.1:3799/console
```

App 内打开 Debug Panel → `DevConnect` → `Send Once` 或 `Start Live Sync` 同步日志到桌面。

DevConnect 自动识别模拟器/真机并配置主机地址。真机需手动输入电脑 IP。

IP 和端口通过 AsyncStorage（如果装了）或原生模块持久化。

扫码是可选功能。安装 `react-native-camera-kit` 或 `expo-camera` 后 DevConnect 会显示扫码按钮。App 需在使用前自行申请相机权限。

## 设备连接

| 运行时 | App endpoint |
| --- | --- |
| iOS 模拟器 | `http://localhost:3799` |
| Android 模拟器 | `http://10.0.2.2:3799` |
| 真机 | `http://<电脑IP>:3799` |

真机先用手机浏览器打开：

```text
http://<电脑IP>:3799/health
```

打不开则检查 Mac 防火墙、Wi-Fi 隔离、VPN、本地网络权限、明文 HTTP 配置。

Daemon 日志存储位置：

```text
~/.react-native-debug-toolkit/daemon-devices.json
```

自定义存储路径：

```bash
npm exec -- debug-toolkit --daemon-only --store /path/to/devices.json
# 或：npx react-native-debug-toolkit --daemon-only --store /path/to/devices.json
DEBUG_TOOLKIT_DAEMON_STORE=/path/to/devices.json npm exec -- debug-toolkit --daemon-only
```

## 用 HTTP 读取日志

AI 或脚本有 shell 访问时，推荐用 HTTP。

```bash
BASE=http://127.0.0.1:3799

curl "$BASE/health"
curl "$BASE/devices"
curl "$BASE/devices/latest"

DEVICE_ID=$(curl -s "$BASE/devices" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log((JSON.parse(s).devices||[])[0]?.deviceId||''))")

curl "$BASE/devices/$DEVICE_ID/logs?limit=100"
curl "$BASE/devices/$DEVICE_ID/logs?type=network&failedOnly=true&limit=50"
curl "$BASE/devices/$DEVICE_ID/logs?type=console&limit=100"
curl "$BASE/devices/$DEVICE_ID/logs?entryId=<entryId>"
curl "$BASE/devices/$DEVICE_ID/logs?limit=100&includeBodies=true"
curl -X DELETE "$BASE/devices"
```

端点：

```text
GET    /health
POST   /report
POST   /ingest
GET    /devices
GET    /devices/latest
GET    /devices/:deviceId
GET    /devices/:deviceId/logs?type=&limit=&failedOnly=&includeBodies=&entryId=
DELETE /devices
GET    /events
GET    /console
```

## 使用 MCP

```bash
claude mcp add debug-toolkit -- npm exec -- debug-toolkit
# 或：claude mcp add debug-toolkit -- npx react-native-debug-toolkit
```

工具：

- `list_app_devices` — 列出已连接设备
- `get_app_logs` — 拉取设备日志

`get_app_logs` 默认不含 body 以节省 token。设 `includeBodies=true` 或传 `entryId` 获取单条完整日志。

## 原生日志

Native Logs 收集当前 App 进程的原生日志，显示在 `Native` Tab。

- Android：收集当前 App 进程可见的 `logcat` 条目。
- iOS：收集 React Native 通过 `RCTLog*` 输出的原生日志。
- DevConnect 会把 Native 日志和当前 session 其他日志一起同步到桌面 daemon。

Release 包默认关闭。内部 release、TestFlight、QA 或灰度构建需要开启时：

```tsx
<DebugView enabled={true} />
```

原生日志可能包含用户数据、token、URL 或设备状态，不要在公开生产包中默认开启。

## App 配置

### 禁用功能

```tsx
<DebugView features={{ clipboard: false, zustand: false }}>
  <AppContent />
</DebugView>
```

### 自定义 Tab

```tsx
import {
  DebugView,
  createDebugTab,
  type DebugFeatureRenderProps,
} from 'react-native-debug-toolkit';

type UserSnapshot = {
  id?: string;
  role?: string;
};

function UserDebugTab({ snapshot }: DebugFeatureRenderProps<UserSnapshot>) {
  return (
    <View>
      <Text>User ID: {snapshot.id ?? '-'}</Text>
      <Text>Role: {snapshot.role ?? '-'}</Text>
    </View>
  );
}

const userDebugTab = createDebugTab<UserSnapshot>({
  name: 'user',
  label: 'User',
  getSnapshot: () => ({
    id: authStore.user?.id,
    role: authStore.user?.role,
  }),
  render: UserDebugTab,
});

<DebugView customFeatures={[userDebugTab]}>
  <AppContent />
</DebugView>;
```

每个自定义 feature 会变成面板 Tab。`name` 是稳定 Tab id，`label` 显示在 Tab 栏，`getSnapshot` 提供数据，`render` 控制展示 UI。需要自动刷新时加 `subscribe`。

### 导航追踪

```tsx
<DebugView navigationRef={navigationRef}>
  <NavigationContainer ref={navigationRef}>
    <AppContent />
  </NavigationContainer>
</DebugView>
```

### Zustand

```tsx
import { zustandLogMiddleware } from 'react-native-debug-toolkit';
```

### Track 事件

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({ eventName: 'button_click' });
```

## 导出

- `DebugView`
- `DebugToolkit`
- `initializeDebugToolkit`
- `createDebugTab`
- `createDebugDeviceReport`
- `checkDaemonConnection`
- `reportDebugDeviceToDaemon`
- `startStreaming`
- `stopStreaming`
- `isStreaming`
- `autoDetectDaemonIp`
- feature factories 和类型

## 边界

- 开发工具，不是生产监控。
- 本地 daemon，不是云回放。
- Network 只观察流量，不分析 auth、token、业务错误。
- 不默认脱敏。
- 不替代 React Native DevTools。

## 许可证

MIT
