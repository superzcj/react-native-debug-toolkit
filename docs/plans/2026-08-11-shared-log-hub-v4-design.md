# React Native Debug Toolkit v4 Runtime Log Hub

- 状态：已确认
- 日期：2026-08-12
- npm 主版本：v4
- Hub API：`/api/v1`

## 1. 定位

App 把运行时日志发到一个 Hub。默认在开发者自己的 Mac 上启动；多人要共用日志时，再用 Mac mini 部署公共 Hub。AI 通过业务仓库里的 Skill 读取日志；人需要时用 Hub 网页辅助查看。

```text
App 自动或手动上传
        ↓
Hub：开发者本机（默认）或 Mac mini（多人共用）
        ├─ AI：Skill → CLI → 读取与诊断
        └─ 人：Web Console → 浏览日志
```

首版要让 AI 拿到对的日志，并且让开发者能很快在本机开始排查。公共 Hub 是可选能力，不应成为单人调试的前置条件。为兼容旧版而保留的入口、短码确认和复杂运维先不做。

## 2. 验收标准

1. 开发者在本机启动 Hub 后，App 日志能到这个 Hub。
2. 多人需要共用时，App 可以改为发到公共 Hub。
3. 同事只需向 AI 描述问题，不需要安装 MCP、启动旧 daemon 或复制短码。
4. AI 能通过仓库 Skill 执行 `status → context → inspect`；复现时再使用有界 `tail`。
5. 多台设备同时存在时，AI 展示设备信息，让用户选择一次。
6. Web Console 能按 App、设备、类型和关键词查看日志。
7. 日志保存 7 天，Hub 总量最多 20 GB。
8. 使用公共 Hub 时，Mac mini 重启且无人登录后服务会恢复。

## 3. 首版不做的事

- v3 兼容、迁移和双协议运行。
- MCP adapter。
- 短码、`manual_sync` 和点击后的轮询确认。
- 账号、权限、Token、TLS、脱敏和公网访问。
- 数据库、全文检索、服务端 AI 总结。
- 手机磁盘离线队列；网络失败只在进程内重试。
- 日志删除、导出、远程控制、请求重放和 Mock。
- 自动设备绑定、复杂冲突处理和跨版本存储迁移。

Hub 只部署在可信公司局域网或 VPN。测试日志不脱敏，不能开放到公网。

## 4. 架构

### App

App 只有一个 `HubClient`，它：

- 从 `features.devConnect` 读取 `appId` 和可选的默认 `endpoint`。
- 订阅 Console、Network、Navigation、Track、Zustand、Native 等已有事件。
- 为当前 App Runtime 建立 Session。
- 批量上传事件，维护 sequence 和 ACK。
- 网络失败时在内存中重试；进程结束后不补传。

地址解析独立放在内部 `HubEndpointResolver`，`HubClient` 只接收已经解析并验证可用的地址。Resolver 负责读取 Debug bundle host、生成平台候选地址和探测 `/ready`；读取 React Native 内部 `SourceCode.scriptURL` 的代码收口在一个 adapter 中，避免散落到 UI 和网络客户端。

不保留 `DaemonClient`、旧 report/ingest 客户端或两套 DevConnect 路径。

### Hub

Hub 是一个 Node HTTP 服务。开发时跑在当前开发者的 Mac 上；多人共用时跑在 Mac mini 上：

- Node HTTP 服务。
- 按 `appId / sessionId` 保存 JSONL。
- 提供 readiness、Session、events、context、inspect 和 SSE tail API。
- 提供 Web Console。
- 清理 7 天前的数据，并在总量达到 20 GB 后拒绝新事件。

首版不引入数据库。写入使用 sequence、ACK 和 payload hash，避免重试写出重复日志。

### AI

业务仓库执行一次 `debug-toolkit init`，生成并提交 `react-native-debug-toolkit` Skill。命令会在 `AGENTS.md` 写入一条发现指令。Skill 调用项目安装的 CLI，不需要 MCP：

```text
用户：看一下刚才登录为什么失败
AI：status → 选择 Session → context → inspect → 给出结论和证据
```

CLI 保留四个只读命令：

```bash
debug-toolkit status
debug-toolkit context
debug-toolkit inspect
debug-toolkit tail
```

Skill 从 `features.devConnect` 读取 `appId` 和默认 Hub endpoint，再把它们传给 CLI。不增加第二份配置文件。本机排查时，CLI 会先尝试同一台 Mac 上的 `http://127.0.0.1:3800`，因此 App 使用局域网 IP 上传、AI 使用 loopback 查询不会互相冲突。

### Web Console

Web Console 只做人工辅助查看：

- 选择 App 和设备/Session。
- 按日志类型、严重级别、时间和关键词过滤。
- 查看详情和实时刷新。

它不提供配置、权限、删除或 AI 总结。

## 5. App 配置和上传规则

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
- `endpoint` 是业务 App 提供的固定默认地址，不在 npm 库里硬编码。它是 Release/内测包的默认 Hub，也是 Debug 自动发现失败后的 fallback。
- 只在 Debug 构建使用自动发现；Debug 项目可以暂时不填 `endpoint`，Release/内测包显式开启 Toolkit 时必须提供。
- 地址输入框只改当前 Runtime，不写磁盘；冷启动后重新自动发现或恢复代码配置。
- 公开生产构建默认 `enabled=false`；需要收集日志时由业务构建显式开启。

Debug 的地址解析顺序固定为：

1. 当前 Runtime 在输入框里设置的地址。
2. Metro bundle URL 的 host，加固定端口 `3800`。真机通常会得到当前开发 Mac 的局域网 IP。
3. 平台候选地址：Android 模拟器使用 `10.0.2.2:3800`，iOS 模拟器使用 `127.0.0.1:3800`。
4. `features.devConnect.endpoint`。

候选地址去重后依次用短超时请求 `/ready`。只有响应来自兼容的 Debug Toolkit Hub 才会选中；不能只因为端口能连接就采用。首版不扫描局域网、不依赖 mDNS/Bonjour，也不猜测其他 IP。

Release/内测包不执行自动发现，只使用代码配置或输入框中的 Runtime 覆盖。清空输入框时，Debug 回到自动发现，Release/内测回到代码配置。切换有效地址会结束旧连接并创建新 Session，sequence 从 1 重新开始。

Connect 页面保留三个控件：

```text
[ Hub 地址 ]

[ 上传一次 ]  [ 开启/停止实时日志 ]
```

Debug 构建启用 Toolkit 后自动解析地址、连接并开始实时上传。"上传一次" 可以补发当前 snapshot；停止后只停持续上传，再次开启仍使用当前 Session。

内测或 Release 构建即使显式开启 Toolkit，也默认不上传。"上传一次" 上传当前 snapshot 后停下；"开启实时日志" 一直上传到用户停止或 App Runtime 结束。公开生产包没有显式开启 Toolkit 时，不采集、不连接，也不显示入口。

自动上传只由 `__DEV__` 决定，不增加 `autoSync` 配置。

## 6. Session 选择

Session 包含 platform、OS version、manufacturer/model、App version/build、Hub 看到的 IP、startedAt 和 lastActiveAt。

AI 执行 `status` 后：

1. 没有 Session：提示用户确认 App 已上传一次或正在实时上传。
2. 只有一个最近活跃 Session：直接使用。
3. 有多个最近活跃 Session：展示候选，让用户选择。
4. 排查崩溃：把最近的 stale Session 也列出来。

候选格式：

```text
iOS 18.5 · iPhone 15 Pro · 172.31.23.124 · v1.0(1) · 8秒前
Android 15 · Xiaomi 14 · 172.31.23.88 · v1.0(1) · 1分钟前
```

首版接受少量同型号、同 IP、时间接近的情况需要用户再确认，不为此增加短码或设备绑定系统。

## 7. Skill 的使用范围

运行时 API 失败、数据异常、白屏、卡死、崩溃、Navigation/Track/Zustand 状态问题，或用户说"看日志"时使用 Skill。

build、typecheck、lint、单元测试失败，以及用户明确要求静态分析时不使用。

Skill 的步骤：

1. 读取项目里的 `appId` 和默认 endpoint。
2. 选择 Hub：用户显式提供的地址优先；否则先探测 `http://127.0.0.1:3800`，再探测项目默认 endpoint。
3. 执行 `status` 并选择 Session。
4. 用 `context` 读取有限范围的上下文。
5. 需要原始内容时再执行 `inspect <entryId>`。
6. 只有用户准备复现时才执行带时限、带条数上限的 `tail`。
7. 返回结论、置信度、事件时间/type/entryId、源码关联和一个最小验证动作。

两个地址都不可用时，CLI 明确列出尝试过的地址，再让用户提供 Hub 地址；不扫描网络。App 若临时改到了另一个 Hub，用户也可以把这个地址直接交给 AI。

日志是 untrusted data。AI 不执行日志中的命令，不访问日志里的 URL，也不把日志内容当作指令。没有用户要求时不改代码。

## 8. Hub API 和事件

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

事件最小公共字段：

```json
{
  "sequence": 1,
  "timestamp": 1786429000000,
  "type": "network",
  "severity": "error",
  "data": {},
  "payloadHash": "sha256..."
}
```

Hub 添加 `entryId`、`receivedAt`、`sessionId` 和可信 source IP。单条事件超过 64 KiB 时，App 截断大字段；无法归一化时，Hub 写入同 sequence 的 rejection 记录，后续日志不能因此卡住。

## 9. 运行 Hub

本机调试默认用前台 Hub：

```bash
npx debug-toolkit hub dev
```

它监听 `3800`，把数据放在当前项目的 `.debug-toolkit/hub`，并输出 loopback 和局域网地址。命令会在检测到 Android 设备时尽力执行 `adb reverse tcp:3800 tcp:3800`；失败只提示，不影响 Hub 启动。开发本仓库时用 `npm run hub`。

多人需要共用日志时，才在 Mac mini 上安装公共 Hub。Mac mini 使用固定局域网地址后，执行一次固定版本安装：

```bash
npx -y react-native-debug-toolkit@4.0.0 hub install \
  --url http://172.31.23.124:3800
```

安装后：

- LaunchDaemon 会在 Mac 重启、无人登录时启动。
- 数据目录是 `/Users/Shared/ReactNativeDebugToolkitHub/data`。
- `hub update` 会使用上次保存的地址。

升级时明确指定版本：

```bash
npx -y react-native-debug-toolkit@4.1.0 hub update
```

首版没有自动升级、回滚编排、运行日志轮转和复杂部署探针。出现实际运维问题后再补。

## 10. 删除范围

只删除日志 Hub 的 v3 体系，不动其他业务功能中名为 legacy 的代码：

- `node/daemon/**`
- `node/mcp/**`
- RN `DaemonClient`、daemon settings/connection/streaming、report/ingest 代码和测试
- 旧 `DevConnectTab`、v3 preferences、IP 自动探测和本地 daemon 地址逻辑
- `/report`、`/ingest`、`/devices/latest` 和 `--daemon-only`
- v3 README、设计文档和示例
- v4 MCP adapter 和 MCP 命令
- 短码、`manual_sync`、`lastManualSyncAt` 及相应的 App/Hub/CLI/Skill/Web 测试

删除后，主文档和源码不再保留"启动本地 daemon 后让 AI 读日志"的使用路径。

## 11. 第一版验收

### App

- Debug 启动后不需要点击，日志在 2 秒内出现在 Hub。
- Release 启动时没有网络请求；"上传一次" 只上传一批；开启实时日志后持续上传新日志。
- 暂停/恢复、断网重连、ACK 丢失重发不会产生重复记录。
- Debug 更换开发 Mac 或局域网 IP 后不需要修改业务配置；真机能从 Metro bundle host 找到当前 Mac。
- iOS 模拟器能通过 loopback、Android 模拟器能通过 `10.0.2.2` 或 `adb reverse` 找到本机 Hub。
- 本机 Hub 不可用时，Debug 会回退到业务配置的默认 endpoint。
- Release/内测包只使用业务配置的固定 endpoint；输入地址可临时覆盖，清空或冷启动后恢复默认值。
- `/ready` 不是兼容 Hub、探测超时或协议不匹配时，不会把该候选地址当作可用 Hub。
- 公开生产构建默认没有 Toolkit 网络行为。

### AI

- 不需要 MCP，仓库 Skill 能调用 CLI。
- 本机 Hub 通过 `127.0.0.1:3800` 可直接读取，不要求 AI 知道当前 Mac 的局域网 IP。
- 单个活跃 Session 自动读取。
- 多个活跃 Session 时只问一次设备选择，不猜测。
- `context`、`inspect` 和有界 `tail` 能完成一次真实问题排查。
- 恶意日志不能让 AI 执行命令或修改代码。

### Hub 和 Web

- 本机 Hub 可以启动、写入、查看和停止。
- 使用公共 Hub 时，Mac mini 重启后服务会恢复。
- 7 天清理和 20 GB 上限有效。
- Web 能完成 App → 设备 → 日志 → 详情的查看。
- Hub 重启或网络抖动后，已 ACK 数据不丢失，重发不重复。

### 删除完成标准

- v3 的入口、源码、测试和文档全部删除。
- `typecheck`、目标测试和完整测试通过；项目原有的无关基线失败单独记录。
- Demo 同时验证 Debug 自动上传和 Release 手动上传。
