# AI Log Reporting v2：本地 Daemon + Device Logs

## 1. 目标

把 RN App 内的 Network、Console、Navigation、Track、Zustand 日志送到本机 daemon。人用 Web Console 看；Claude Code / Codex 用 HTTP API 读；MCP 只做可选适配。

核心目标：

1. App 按设备上报当前 debug 日志。
2. Daemon 接收、持久化、查询、SSE 推送。
3. Web Console 实时看设备日志。
4. AI 通过 HTTP API / MCP 读日志。
5. 真机可用，失败可诊断。

非目标：

- 不接 AI API。
- 不做服务端总结。
- 不做完整远程调试器。
- 不把 Network 日志当 auth/token 系统；它只是监测数据。
- 不默认脱敏；开发者本机自用，保留原始调试上下文。

## 2. 当前架构

```text
RN App
  collect logs
  check /health
  POST /report
  POST /ingest
        ↓
local daemon
  device log store
  HTTP JSON API
  SSE /events
        ├─ Web Console
        ├─ curl / shell AI
        └─ MCP adapter
```

边界：

- App 只采集、截断、上报。
- Daemon 是本机设备日志中心。
- HTTP API 是协议层；Web Console、curl、MCP 共用它。
- Claude Code / Codex 有 shell，优先 curl。
- MCP 给无 shell 或需要 tool discovery 的 AI 客户端。
- Daemon 独立运行；CLI daemon 默认把设备日志写到本地文件。

## 3. 启动

发布入口只有一个：

```bash
npx debug-toolkit --daemon-only
```

本仓库本地调试：

```bash
node bin/debug-toolkit.js --daemon-only
```

输出示例：

```text
react-native-debug-toolkit-daemon listening on http://0.0.0.0:3799
Web Console: http://127.0.0.1:3799/console
LAN IPs: 192.168.100.12, 198.18.0.1
Device store: ~/.react-native-debug-toolkit/daemon-devices.json
```

本机检查：

```bash
BASE=http://127.0.0.1:3799
curl "$BASE/health"
curl "$BASE/devices"
curl "$BASE/devices/latest"
curl "$BASE/devices/<deviceId>/logs?type=network&failedOnly=true&limit=50"
```

MCP 可选：

```bash
claude mcp add debug-toolkit -- npx debug-toolkit
```

## 4. App 侧

### 4.1 API

```ts
createDebugDeviceReport(options?): DebugDeviceReport
checkDaemonConnection(options?): Promise<DaemonConnectionResult>
reportDebugDeviceToDaemon(options?): Promise<ReportResult>
startStreaming(options?): void
stopStreaming(): void
isStreaming(): boolean
autoDetectDaemonIp(options?): Promise<AutoDetectResult>
```

默认 endpoint：

| 场景 | endpoint |
| --- | --- |
| iOS simulator | `http://localhost:3799` |
| Android emulator | `http://10.0.2.2:3799` |
| 真机 | `http://<mac-ip>:3799` |

### 4.2 Desktop Logs UI

Debug Panel 一级只保留 `Desktop Logs` 入口。

面板内能力：

- `Simulator` / `Real device` 切换。
- 模拟器默认启用实时同步；真机通过 Mac IP 连接。
- 设置只保存在 JS runtime；不依赖 AsyncStorage。
- App 杀进程后，daemon 端设备日志仍保留。
- `Send Once`：先 `GET /health`，成功后 `POST /report`。
- `Start Live Sync`：先 `GET /health`，成功后初始 `POST /report`，后续 `POST /ingest`。
- 预检失败：不发 `/report`，不启动 sync，提示检查 daemon、IP、防火墙、本地网络权限。
- Live Sync POST 有 timeout + 持续 retry；长时间运行不因次数上限停止。

### 4.3 真机排查

顺序固定：

1. 启动 `debug-toolkit --daemon-only`。
2. 看 `LAN IPs`，选和手机同网段 IP；跳过 VPN/虚拟网卡 IP。
3. 手机浏览器打开 `http://<mac-ip>:3799/health`。
4. 浏览器打不开 -> App 也不会通。查 Mac 防火墙、同 Wi-Fi、设备隔离、公司网络策略。
5. 宿主 App 需允许开发期明文局域网 HTTP：iOS 本地网络/ATS；Android cleartext traffic。

### 4.4 数据来源

聚合边界是 `DebugToolkit.features`：

```ts
for (const feature of DebugToolkit.features) {
  const snapshot = feature.getSnapshot();
  if (Array.isArray(snapshot)) {
    logs[feature.name] = snapshot.slice(-maxPerType);
  }
}
```

不读 feature 内部 store。

当前截断：

- 每类最多 50 条。
- 单个 request / response body 最多 16KB。
- 不默认脱敏。
- 整体 budget、error-first pruning 后置。

自污染：

- `reportDebugDeviceToDaemon()`、`startStreaming()` 会把 daemon endpoint 加入 Network blacklist。
- 上报 daemon 的请求不进入 Network 日志。

## 5. Report 格式

```ts
interface DebugDeviceReport {
  version: 2;
  device: {
    platform: string;
    model: string;
    osVersion: string;
    appVersion: string;
  };
  logs: {
    network?: NetworkLogEntry[];
    console?: ConsoleLogEntry[];
    navigation?: NavigationLogEntry[];
    track?: TrackLogEntry[];
    zustand?: ZustandLogEntry[];
    [featureName: string]: unknown[] | undefined;
  };
}
```

说明：

- `device` 用于 Web Console 识别设备。
- Daemon 用 `device.platform + device.model + source.ip` 生成 `deviceId`。
- 同一设备重复上报会覆盖当前完整 report；增量 `/ingest` 追加到同一设备。
- 诊断排序、摘要交给 AI；App 不预生成。

## 6. Daemon API

Web：

```text
GET /                  -> 302 /console
GET /console           -> Web Console HTML
GET /events            -> SSE
```

JSON：

```text
GET    /health
POST   /report
POST   /ingest
GET    /devices
GET    /devices/latest
GET    /devices/:deviceId
GET    /devices/:deviceId/logs?type=network&limit=50&failedOnly=true
DELETE /devices
```

`GET /health` 返回：

```json
{
  "ok": true,
  "name": "react-native-debug-toolkit-daemon",
  "version": "0.1.0",
  "protocolVersion": 2,
  "ips": ["192.168.100.12"],
  "deviceStore": "~/.react-native-debug-toolkit/daemon-devices.json"
}
```

`POST /report` req：

```json
{
  "version": 2,
  "device": {},
  "logs": {}
}
```

`POST /report` res：

```json
{
  "ok": true,
  "deviceId": "ios_iphone_192_168_100_20",
  "receivedAt": "2026-05-13T00:00:00.000Z",
  "logCount": {
    "network": 15,
    "console": 30
  }
}
```

`POST /ingest` req：

```json
{
  "deviceId": "ios_iphone_192_168_100_20",
  "delta": {
    "logs": {
      "console": [{ "level": "error", "data": ["TEST_ERROR"] }]
    }
  }
}
```

监听：

- 默认 `0.0.0.0:3799`，支持真机通过 Mac IP 上报。
- MCP / 本机 curl 读 `127.0.0.1:3799`。
- 只想本机模拟器用：`debug-toolkit --host 127.0.0.1 --port 3799`。

Token：

- 默认无 token。
- `--token` 只是可选门禁，不是核心设计。
- 配 token 后，读写接口接受 `Authorization: Bearer <token>` 或 query `?token=<token>`。

存储：

- CLI daemon 默认持久化到 `~/.react-native-debug-toolkit/daemon-devices.json`。
- `--store /path/to/devices.json` 或 `DEBUG_TOOLKIT_DAEMON_STORE` 可覆盖存储路径。
- 最多 20 台设备。
- 每台设备保存当前完整 report；`/ingest` 合并增量。
- `DELETE /devices` 清空 store。

## 7. Web Console

已实现：

- 设备列表。
- 设备详情。
- type 筛选。
- failed only。
- 复制 JSON。
- curl 命令。
- 日志倒序，新日志在上。
- JSON 按日志类型解析成更易读的详情区。
- SSE 实时刷新。
- 增量日志合并，不重建整页。
- 设备卡片状态保留。

未实现：

- 浏览器级 e2e。
- 多设备自定义命名。
- Doctor 页。

## 8. AI 读取

### 8.1 curl / HTTP 优先

Claude Code / Codex 直接 curl：

```bash
BASE=http://127.0.0.1:3799
curl "$BASE/devices"
curl "$BASE/devices/latest"
curl "$BASE/devices/<deviceId>/logs?limit=100"
curl "$BASE/devices/<deviceId>/logs?limit=100&includeBodies=true"
curl "$BASE/devices/<deviceId>/logs?type=network&failedOnly=true&limit=50"
curl "$BASE/devices/<deviceId>/logs?type=console&limit=100"
curl "$BASE/devices/<deviceId>/logs?entryId=<entryId>"
```

读法：

1. 先 `/devices`，确认有哪些设备。
2. 最近一次用 `/devices/latest`。
3. 上下文太大用 `/logs` + `type` / `failedOnly` / `limit`。
4. Network 只是监测数据；不做 token/auth 特殊语义。

### 8.2 MCP 可选

MCP 价值：

- `tools/list` 自动发现工具。
- 无 shell AI 客户端可用。
- tool schema 降低 path/param 拼错概率。
- adapter 可做 AI 友好裁剪。

MCP 不接收 App 日志，不存日志，只转 daemon HTTP API。

当前工具：

- `get_app_logs`
- `list_app_devices`

`get_app_logs` 参数：

```json
{
  "deviceId": "ios_iphone_192_168_100_20",
  "logType": "network",
  "limit": 50,
  "failedOnly": false,
  "includeBodies": false,
  "entryId": null
}
```

`includeBodies` 默认 `false`，降低 MCP token 消耗。传 `entryId` 时自动启用 body 返回指定条目。

Daemon 自动拉起：

```text
ensureDaemon()
  -> GET /health
  -> ok: use existing daemon
  -> fail: spawn debug-toolkit --daemon-only
  -> poll /health up to 3s
  -> fail: MCP tool returns error
```

## 9. 包结构

```text
src/utils/deviceReport.ts
src/utils/daemonConnection.ts
src/utils/reportToDaemon.ts
src/utils/streamToDaemon.ts
src/utils/autoDetectDaemon.ts
src/utils/daemonSettings.ts
src/utils/daemonStreaming.ts
node/daemon/
node/daemon/src/console/
node/mcp/
bin/debug-toolkit.js
```

发布：

- 单包：`react-native-debug-toolkit`。
- 单 bin：`debug-toolkit`。
- RN 入口仍是 `src/index.ts` / `lib/*`。
- Node 代码在 `node/*`，通过 bin 使用；不进 RN bundle。

## 10. 当前状态

已实现：

1. 单 bin：`bin/debug-toolkit.js`。
2. Daemon HTTP API + Web Console + SSE。
3. Daemon 本地设备日志持久化。
4. MCP adapter：`get_app_logs`、`list_app_devices`。
5. App API：`createDebugDeviceReport()`、`checkDaemonConnection()`、`reportDebugDeviceToDaemon()`、`startStreaming()`、`stopStreaming()`。
6. Desktop Logs UI：连接预检、Send Once、Live Sync、真机 IP。
7. Live Sync timeout + 持续 retry。
8. 默认 daemon 监听 `0.0.0.0:3799`，打印 `LAN IPs`。
9. Network daemon blacklist，避免自污染。
10. 不默认脱敏；network 日志只做监测。

未实现：

1. MCP `clear_app_logs`。
2. CLI 查询命令：`debug-toolkit devices`、`debug-toolkit logs`。
3. AI bundle / `bundleId`。
4. Doctor 页。
5. Store 保留策略配置。
6. 多设备自定义命名、自动选择正确 Mac IP。
7. Web Console e2e。

验收：

```bash
npm run typecheck
npm test -- --runInBand --watchman=false
npm run lint
npm pack --dry-run
```
