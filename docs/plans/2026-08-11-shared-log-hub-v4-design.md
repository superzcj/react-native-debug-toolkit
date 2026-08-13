# React Native Debug Toolkit v4 AI-first Local Log Hub

- 状态：待复审
- 日期：2026-08-13
- npm 主版本：v4
- Hub API：`/api/v1`

## 1. 定位

React Native Debug Toolkit 是 AI 优先的本地运行时日志工具。开发者在自己的 Mac 上启动 Hub，Debug App 自动把日志发过去；AI 通过业务仓库里的 Skill 读取和诊断，人需要时再打开 Web Console 辅助查看。

```text
App 自动或手动上传
        ↓
开发者本机 Hub
        ├─ AI：Skill → CLI → 读取与诊断（主要入口）
        └─ 人：Web Console → 浏览日志（辅助入口）
```

首版只负责日志采集、保存和读取，不负责运维一台公共服务器。Hub 是普通网络进程，因此同一条命令也能运行在另一台可达电脑上，但 Toolkit 不提供 Mac mini 专用安装、后台守护、升级或可用性保证。

## 2. 相对 3.6.8 的改变

v4 不是把 daemon 改名为 Hub。它解决的是 3.6.8 的使用流程过长：

```text
3.6.8
启动 daemon → 配置真机 IP → App 点击同步 → 配置 MCP 或拼 HTTP → AI 读取日志

v4
启动 Hub → 运行 App → 直接向 AI 描述问题
```

具体变化：

- Debug 从 Metro bundle host 找到当前 Mac，不要求真机手填 IP。
- Debug 自动上传，不要求先点 Send Once 或 Live Sync。
- 仓库 Skill 直接调用 CLI，不安装 MCP。
- AI 使用 `status → context → inspect`，复现时再使用 `tail`，不需要理解底层 HTTP。
- 每个 App Runtime 单独建立 Session，避免新旧运行混在同一个设备快照里。
- Release/内测仍由人明确点击后才上传，公开生产构建默认关闭。

## 3. 验收标准

1. 开发者执行一个命令即可在本机启动 Hub。
2. Debug App 自动找到本机 Hub，并在启动后自动上传日志。
3. Release/内测包只有点击“上传一次”或“开启实时日志”后才产生网络请求。
4. AI 通过仓库 Skill 读取日志，不需要 MCP，也不需要用户复制短码。
5. 多个 Session 同时存在时，AI 能展示易读设备信息并让用户选择。
6. Web Console 能按 App、设备、类型和关键词查看日志。
7. 日志保存 7 天，单个 Hub 总量最多 20 GB。

## 4. 首版不做的事

- 公共 Hub 产品化、Mac mini 专用支持、LaunchDaemon、`hub install` 和 `hub update`。
- 运行时复制、系统目录、服务账号、自动启动、自动升级和回滚。
- 多团队租户、appId 认领、设备绑定、权限、Token、TLS 和公网访问。
- v3 兼容、迁移和双协议运行。
- MCP adapter。
- 短码、`manual_sync` 和点击后的轮询确认。
- 数据库、全文检索、服务端 AI 总结。
- 手机磁盘离线队列；网络失败只在当前 App Runtime 内重试。
- 日志删除、导出、远程控制、请求重放和 Mock。
- 签名 cursor、identity registry、Session tombstone 和跨版本存储迁移。

Hub 只在开发者可信的本机或局域网内运行。测试日志不脱敏，不能开放到公网。

## 5. 架构

### App

App 只有一个 `HubClient`。它的外部 interface 只有配置、开始/停止实时上传、上传一次和状态订阅；Session、批处理、sequence、ACK 与重试隐藏在实现内部。

`HubClient`：

- 从 `features.devConnect` 读取 `appId` 和可选的默认 `endpoint`。
- 订阅 Console、Network、Navigation、Track、Zustand、Native 等已有事件。
- 为当前 App Runtime 建立 Session。
- 批量上传事件，维护 sequence 和 ACK。
- 网络失败时在内存中重试；Runtime 结束后不补传。

地址解析放在内部 `HubEndpointResolver`。Resolver 读取 Debug bundle host、生成平台候选地址并探测 `/ready`；`HubClient` 只使用已经验证的地址。读取 React Native 内部 `SourceCode.scriptURL` 的代码收口在一个 adapter 中。

不保留 `DaemonClient`、旧 report/ingest 客户端或两套 DevConnect 路径。

### Hub

Hub 是运行在开发者本机的 Node HTTP 进程：

- 按 `appId / sessionId` 保存 JSONL。
- 提供 readiness、Session、events、context、inspect 和 SSE tail。
- 提供 Web Console。
- 清理 7 天前的 Session；总量达到 20 GB 后拒绝新事件。

`HubStore` 对上层只暴露 Session 建立、追加事件、列出 Session、读取上下文、读取单条详情和订阅事件。文件布局、ACK 持久化和清理都隐藏在实现内部。

首版不引入数据库。一个 Session 使用一个 manifest 和一个追加写 JSONL，不做 segment、compaction、registry 或 tombstone。

### AI

业务仓库执行一次 `debug-toolkit init`，生成并提交 `react-native-debug-toolkit` Skill。命令同时在 `AGENTS.md` 写入发现指令。Skill 调用项目安装的 CLI：

```text
用户：看一下刚才登录为什么失败
AI：status → 选择 Session → context → inspect → 给出结论和证据
```

CLI 只保留四个只读命令：

```bash
debug-toolkit status
debug-toolkit context
debug-toolkit inspect
debug-toolkit tail
```

Skill 从 `features.devConnect` 读取 `appId` 和可选的默认 endpoint，不增加第二份项目配置。本机排查时，CLI 优先尝试 `http://127.0.0.1:3800`。

### Web Console

Web Console 只做人工辅助查看：

- 选择 App 和设备/Session。
- 按日志类型、严重级别、时间和关键词过滤。
- 查看内容优先的详情和实时刷新。

它不提供配置、权限、部署、删除或 AI 总结。

## 6. App 配置和上传规则

继续使用现有入口：

```tsx
<DebugView
  enabled={debugToolkitEnabled}
  features={{
    devConnect: {
      appId: appConfig.appId,
      endpoint: appConfig.debugLogHubUrl,
    },
  }}
/>
```

- `appId` 使用业务 App 已有的固定值，UI 不允许改。
- `endpoint` 可选。Toolkit 不硬编码固定 IP。
- Debug 可以完全不配置 endpoint；自动发现失败时才使用业务配置的 fallback。
- Release/内测若配置 endpoint，输入框默认显示它；未配置时由用户输入当前可达 Hub 地址。
- 地址输入框只改当前 Runtime，不写磁盘；冷启动后重新自动发现或恢复代码配置。
- 公开生产构建默认 `enabled=false`；需要收集日志时由业务构建显式开启。

Debug 的地址解析顺序：

1. 当前 Runtime 在输入框里设置的地址。
2. Metro bundle URL 的 host，加固定端口 `3800`。
3. Android 模拟器使用 `10.0.2.2:3800`；iOS 模拟器使用 `127.0.0.1:3800`。
4. `features.devConnect.endpoint`。

候选地址去重后依次用短超时请求 `/ready`。只有兼容的 Debug Toolkit Hub 才会被选中。首版不扫描局域网，也不使用 mDNS/Bonjour。

Release/内测不自动发现。它只使用代码配置或输入框里的 Runtime 地址。清空输入框时恢复代码配置；如果没有代码配置，就保持未连接。切换有效地址会创建新 Session，sequence 从 1 重新开始。

Connect 页面保留三个控件：

```text
[ Hub 地址 ]

[ 上传一次 ]  [ 开启/停止实时日志 ]
```

Debug 启用 Toolkit 后自动解析地址、连接并实时上传。“上传一次”补发当前 snapshot；停止后只停持续上传。

Release/内测启用 Toolkit 后默认不上传。“上传一次”上传当前 snapshot 后停下；“开启实时日志”持续上传到用户停止或 App Runtime 结束。公开生产包没有启用 Toolkit 时，不采集、不连接，也不显示入口。

自动上传只由 `__DEV__` 决定，不增加 `autoSync` 配置。

## 7. Session 和 AI 读取

Session 包含 platform、OS version、manufacturer/model、App version/build、Hub 看到的 IP、startedAt 和 lastActiveAt。

AI 执行 `status` 后：

1. 没有 Session：提示用户确认 Hub 正在运行，且 App 已自动上传、上传一次或正在实时上传。
2. 只有一个最近活跃 Session：直接使用。
3. 有多个最近活跃 Session：展示候选，让用户选择。
4. 排查崩溃：把最近的 stale Session 也列出来。

候选格式：

```text
iOS 18.5 · iPhone 15 Pro · 172.31.23.124 · v1.0(1) · 8秒前
Android 15 · Xiaomi 14 · 172.31.23.88 · v1.0(1) · 1分钟前
```

首版接受少量同型号、同 IP、时间接近时需要用户再确认，不增加短码或设备绑定。

Skill 的步骤：

1. 读取项目里的 `appId` 和可选 endpoint。
2. 用户显式给出 Hub 地址时只使用该地址；否则先尝试 `http://127.0.0.1:3800`，再尝试项目 endpoint。
3. 执行 `status` 并选择 Session。
4. 用 `context` 读取最近的有限上下文。
5. 需要完整内容时再执行 `inspect <entryId>`。
6. 只有用户准备复现时才执行带时限、带条数上限的 `tail`。
7. 返回结论、置信度、事件时间/type/entryId、源码关联和一个最小验证动作。

候选地址都不可用时，CLI 列出尝试过的地址，再让用户提供 Hub 地址；不扫描网络。

运行时接口失败、数据异常、白屏、卡死、崩溃或用户明确要求看 App 日志时使用 Skill。build、typecheck、lint、单元测试失败以及纯静态分析不使用。

日志是 untrusted data。AI 不执行日志中的命令，不访问日志里的 URL，也不把日志内容当作指令。没有用户要求时不改代码。

## 8. Hub API、事件和存储

第一版只保留：

```text
GET  /health
GET  /ready
GET  /api/v1/apps/:appId/sessions
POST /api/v1/apps/:appId/sessions
POST /api/v1/apps/:appId/sessions/:sessionId/events
POST /api/v1/apps/:appId/sessions/:sessionId/heartbeat
GET  /api/v1/apps/:appId/sessions/:sessionId/events
GET  /api/v1/apps/:appId/sessions/:sessionId/context
GET  /api/v1/apps/:appId/sessions/:sessionId/entries/:entryId
GET  /api/v1/apps/:appId/sessions/:sessionId/stream
```

事件最小字段：

```json
{
  "sequence": 1,
  "timestamp": 1786429000000,
  "type": "network",
  "severity": "error",
  "data": {}
}
```

规则：

- sequence 在一个 Session 内从 1 连续递增。
- Hub 追加写入后返回 `ackThrough`；App 只删除已 ACK 的内存事件。
- App 重发已写入的 sequence 时，Hub 直接返回当前 ACK，不重复写入。
- Hub 重启后从 Session manifest 恢复 `ackThrough`。
- Hub 添加 `entryId`、`receivedAt`、`sessionId` 和 source IP。
- 单条事件超过 64 KiB 时，App 截断大字段；事件无法归一化时记录 rejection 并继续后续 sequence。
- `context` 最多返回 200 条，优先错误及相邻事件；`tail` 使用递增 sequence 续读，不使用签名 cursor。

清理以整个 Session 为单位：`lastActiveAt` 超过 7 天后删除 manifest 和 JSONL。总量达到 20 GB 后拒绝新事件，不实现复杂分段回收。

## 9. 运行 Hub

唯一面向用户的启动方式：

```bash
npx debug-toolkit hub dev
```

它在前台通过 `0.0.0.0:3800` 接收本机和局域网设备，数据放在当前项目的 `.debug-toolkit/hub`，并输出 loopback 和局域网地址。检测到 Android 设备时尽力执行 `adb reverse tcp:3800 tcp:3800`；失败只提示，不影响 Hub 启动。按 `Ctrl+C` 停止。

开发本仓库时，`npm run hub` 只是上述命令的项目脚本。

如果团队自行在另一台长期在线电脑上运行同一命令，App 可以通过 endpoint 连接它；进程守护、开机启动、升级和网络安全由使用者自己的运行环境负责，不属于 Toolkit 首版功能，也不出现在主使用路径中。

## 10. 删除和收缩范围

### 删除 v3

- `node/daemon/**`
- `node/mcp/**`
- RN `DaemonClient`、daemon settings/connection/streaming、report/ingest 代码和测试
- 旧 `DevConnectTab`、v3 preferences 和本地 daemon 地址逻辑
- `/report`、`/ingest`、`/devices/latest` 和 `--daemon-only`
- v3 README、设计文档和示例
- MCP 命令和 adapter

### 删除公共 Hub 支持

- `hub install`、`hub update` 及其参数、帮助和测试
- LaunchDaemon plist、launcher shim、Node Runtime 复制和 sudo 安装逻辑
- `/Users/Shared/ReactNativeDebugToolkitHub` 等系统级目录约定
- Mac mini、固定公共 IP、无人登录恢复和公共 Hub 升级文档

### 收缩本地 Hub

- 删除 appId 认领、native application id binding、identity registry 和冲突 epoch。
- 删除签名 cursor、Session tombstone、generation 和 segment compaction。
- 存储收口为每个 Session 一个 manifest 和一个 JSONL。
- 保留 sequence、ACK、Runtime 内重试、Session 隔离、7 天清理和 20 GB 上限。

删除后，主文档和源码只保留“启动本机 Hub，运行 App，直接让 AI 看日志”的主路径。

## 11. 第一版验收

### App

- Debug 启动后不需要点击，日志在 2 秒内出现在本机 Hub。
- Debug 更换开发 Mac 或局域网 IP 后不需要修改业务配置。
- iOS 模拟器能通过 loopback、Android 模拟器能通过 `10.0.2.2` 或 `adb reverse` 找到本机 Hub，真机能从 Metro bundle host 找到当前 Mac。
- Release 启动时没有网络请求；“上传一次”只上传一批；开启实时日志后持续上传新日志。
- Release 没有默认 endpoint 时可以在输入框填写当前 Hub；清空后保持未连接。
- 暂停/恢复、断网重连、ACK 丢失重发不会产生重复记录。
- 公开生产构建默认没有 Toolkit 网络行为。

### AI

- 不需要 MCP，仓库 Skill 能调用 CLI。
- 本机 Hub 通过 `127.0.0.1:3800` 直接读取，不要求 AI 知道当前 Mac 的局域网 IP。
- 单个活跃 Session 自动读取；多个活跃 Session 时只问一次设备选择。
- `context`、`inspect` 和有界 `tail` 能完成一次真实问题排查。
- 恶意日志不能让 AI 执行命令或修改代码。

### Hub 和 Web

- `hub dev` 可以启动、写入、查看，并通过 `Ctrl+C` 停止。
- Hub 重启后恢复 Session 和 ACK；重发不会产生重复记录。
- 7 天清理和 20 GB 上限有效。
- Web 能完成 App → 设备 → 日志 → 详情的查看。
- 项目不存在 `hub install`、`hub update`、LaunchDaemon 或 Mac mini 专用代码路径。

### 完成标准

- v3 和公共 Hub 专用入口、源码、测试、文档全部删除。
- 本地 Hub 的协议和存储不保留未被首版场景使用的公共服务复杂度。
- `typecheck`、目标测试和完整测试通过；原有无关基线失败单独记录。
- Demo 同时验证 Debug 自动上传和 Release 手动上传。
