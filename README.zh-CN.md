# React Native Debug Toolkit

[English](README.md)

React Native 开发期调试面板 + 本地日志桥。

它能在 App 内看日志，也能把同一台设备的日志流发到本机 daemon，供浏览器、curl、脚本、MCP 读取。

## 模型

```text
RN App logs -> Debug Panel -> local daemon -> Web Console / HTTP / MCP
```

采集：

- Network
- Console
- Navigation
- Track
- Zustand

CLI daemon 默认把设备日志持久化到 `~/.react-native-debug-toolkit/daemon-devices.json`。
用 `DELETE /devices` 清空已存日志。

## 安装

```bash
npm install react-native-debug-toolkit
```

可选：

```bash
npm install @react-native-clipboard/clipboard
npm install @react-native-async-storage/async-storage
```

## App 接入

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

开发模式打开 App。点击 `DBG`。

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

## Desktop Logs

启动 daemon：

```bash
npx debug-toolkit --daemon-only
```

默认设备日志存储文件：`~/.react-native-debug-toolkit/daemon-devices.json`。
可用 `--store /path/to/devices.json` 或 `DEBUG_TOOLKIT_DAEMON_STORE` 覆盖。

打开：

```text
http://127.0.0.1:3799/console
```

App 内：Debug Panel -> 齿轮 -> `Send Once` 或 `Start Live Sync`。

Endpoint：

| 运行时 | Endpoint |
| --- | --- |
| iOS simulator | `http://localhost:3799` |
| Android emulator | `http://10.0.2.2:3799` |
| 真机 | `http://<mac-ip>:3799` |

真机规则：手机浏览器必须能打开 `http://<mac-ip>:3799/health`。打不开就查防火墙、Wi-Fi 隔离、VPN、明文 HTTP。

## HTTP

```bash
BASE=http://127.0.0.1:3799

curl "$BASE/health"
curl "$BASE/devices"
curl "$BASE/devices/latest"

DEVICE_ID=$(curl -s "$BASE/devices" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log((JSON.parse(s).devices||[])[0]?.deviceId||''))")

curl "$BASE/devices/$DEVICE_ID"
curl "$BASE/devices/$DEVICE_ID/logs?limit=100"
curl "$BASE/devices/$DEVICE_ID/logs?type=network&failedOnly=true&limit=50"
curl "$BASE/devices/$DEVICE_ID/logs?type=console&limit=100"
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
GET    /devices/:deviceId/logs
DELETE /devices
GET    /events
GET    /console
```

## MCP

```bash
claude mcp add debug-toolkit -- npx debug-toolkit
```

工具：

- `list_app_devices`
- `get_app_logs`

有 shell 时优先 curl。

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
- Network 日志只是监测流量，不做 auth/token 分析。
- 不默认脱敏。
- 不替代 React Native DevTools。

## 许可证

MIT
