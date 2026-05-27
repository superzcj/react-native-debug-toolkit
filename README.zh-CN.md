# React Native Debug Toolkit

![demo](demo.gif)

[English](README.md)

React Native Debug Toolkit 是 React Native 开发期本地调试工具。

它可以在 App 内查看日志，把模拟器或真机日志同步到桌面 Web Console，也可以让 AI 编程工具通过 HTTP 或 MCP 直接读取真实运行日志。

```text
RN App -> Debug Panel -> local daemon -> Web Console / HTTP API / MCP
```

## 能做什么

- App 内调试面板：Network、Console、Navigation、Track、Zustand、Environment、Clipboard。
- 桌面 Web Console：查看模拟器和真机日志。
- 本地 HTTP API：给 curl、脚本、Codex、Claude Code、其他有 shell 的 AI 读取。
- 可选 MCP：提供 `list_app_devices` 和 `get_app_logs`。
- 本地优先：不接云服务，包内不调用 AI API。

## 安装

```bash
npm install react-native-debug-toolkit
```

安装原生部分并重新构建 App：

```bash
cd ios && pod install
# Android：下次构建时 Gradle autolinking 生效
```

Expo Go 不能加载这个原生模块。Expo 项目需用 development build、prebuild，或 bare React Native。

可选依赖：

```bash
npm install @react-native-clipboard/clipboard
npm install @react-native-async-storage/async-storage
```

## 快速开始

包住你的 App：

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

开发模式打开 App，点击 `DBG`。

启动桌面 daemon：

```bash
npm exec debug-toolkit --daemon-only
# 或：npx debug-toolkit --daemon-only
```

打开 Web Console：

```text
http://127.0.0.1:3799/console
```

App 内打开 Debug Panel -> `DevConnect` -> `Send Once` 或 `Start Live Sync` 同步桌面日志。

DevConnect 自动识别模拟器/真机，模拟器下自动使用本机 Metro/daemon 地址。真机需输入电脑 IP 地址。

Remote JS Bundle：先在电脑启动 Metro，在 `DevConnect` 输入电脑 IP 和 Metro 端口，然后点 `Use Metro Bundle`。DevConnect 会写入 React Native 原生 dev-server host 设置并 reload App。IP 和端口会通过 AsyncStorage 持久化；如果没装 AsyncStorage，则在重建后通过本库原生模块持久化。

扫码是可选能力。App 安装 `react-native-camera-kit` 或 `expo-camera` 后，DevConnect 才显示扫码按钮。App 仍需自己配置相机权限文案，并在使用扫码前申请相机权限。

## 设备连接

| 运行时 | App endpoint |
| --- | --- |
| iOS simulator | `http://localhost:3799` |
| Android emulator | `http://10.0.2.2:3799` |
| 真机 | `http://<mac-ip>:3799` |

真机先用手机浏览器打开：

```text
http://<mac-ip>:3799/health
```

打不开就检查 Mac 防火墙、Wi-Fi 隔离、VPN、本地网络权限、明文 HTTP 配置。

daemon 默认日志文件：

```text
~/.react-native-debug-toolkit/daemon-devices.json
```

自定义存储路径：

```bash
npm exec debug-toolkit --daemon-only --store /path/to/devices.json
# 或：npx debug-toolkit --daemon-only --store /path/to/devices.json
DEBUG_TOOLKIT_DAEMON_STORE=/path/to/devices.json npm exec debug-toolkit --daemon-only
```

## 用 HTTP 读取日志

AI 或脚本有 shell 时，优先用 HTTP。

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

主要端点：

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
claude mcp add debug-toolkit -- npm exec debug-toolkit
# 或：claude mcp add debug-toolkit -- npx debug-toolkit
```

工具：

- `list_app_devices`
- `get_app_logs`

`get_app_logs` 默认不返回 body，减少 token。设置 `includeBodies=true` 或传 `entryId` 可读取单条完整日志。

## App 配置

禁用功能：

```tsx
<DebugView features={{ clipboard: false, zustand: false }}>
  <AppContent />
</DebugView>
```

导航追踪：

```tsx
<DebugView navigationRef={navigationRef}>
  <NavigationContainer ref={navigationRef}>
    <AppContent />
  </NavigationContainer>
</DebugView>
```

Zustand：

```tsx
import { zustandLogMiddleware } from 'react-native-debug-toolkit';
```

Track：

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({ eventName: 'button_click' });
```

## 导出

- `DebugView`
- `DebugToolkit`
- `initializeDebugToolkit`
- `createDebugDeviceReport`
- `checkDaemonConnection`
- `reportDebugDeviceToDaemon`
- `startStreaming`
- `stopStreaming`
- `isStreaming`
- `autoDetectDaemonIp`
- feature factories and types

## 边界

- 开发工具，不是生产监控。
- 本地 daemon，不是云 replay。
- Network 只观察流量，不自动分析 auth、token、业务错误。
- 不默认脱敏。
- 不替代 React Native DevTools。

## 许可证

MIT
