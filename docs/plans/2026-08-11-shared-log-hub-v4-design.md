# React Native Debug Toolkit v4：AI-first Shared Log Hub 设计

- 状态：已确认
- 日期：2026-08-11
- npm 主版本：v4（破坏性升级）
- Hub API：`/api/v1`

## 1. 背景与结论

当前方案要求每位开发者在自己的电脑上启动 daemon，真机再配置电脑 IP；AI 如果通过 MCP 读取日志，还需要用户额外安装和配置 MCP。这条链路对熟悉项目的人尚可，但无法自然扩展到其他部门，也很容易停在“服务没开、IP 不对、MCP 没装”这些与排查问题无关的步骤上。

v4 将现有 daemon 重建为部署在公共 Mac mini 上的 Shared Log Hub：

```text
React Native App
  └─ HTTP 批量上传
       ↓
Shared Log Hub（Mac mini，固定 IP，launchd 常驻）
  ├─ Session-scoped JSONL
  ├─ HTTP query / SSE tail
  ├─ Read-only Web Console
  ├─ CLI → repo Skill → AI（主入口）
  └─ MCP adapter（可选）
```

同一份 Hub 程序也能以前台模式运行在开发者电脑上，但产品和代码中不再维护“local daemon”和“shared hub”两套架构。

## 2. 目标、成功标准与非目标

### 2.1 目标

1. 其他部门的同事不需要运行本地服务，也不需要安装 MCP，就能让仓库内 AI 读取当前 App 日志。
2. App 只需要现有配置入口中的固定 `appId` 和 Hub endpoint；不新增独立配置文件。
3. 开发和内部测试构建默认自动持续上传，正式生产构建默认关闭。
4. AI 获得稳定、可定位、可续读且明确标示缺口的证据，而不是一份不断覆盖的“最新快照”。
5. Mac mini 上只有一个可自动启动、自动恢复、容量有界的服务，不引入数据库、容器、账号或权限系统。

### 2.2 成功标准

- 新同事完成 App 接入后，日常只需运行 App 并向 AI 描述问题；AI 为避免读错同事日志，会先要求告知“立即同步”按钮里的短码，锁定后再让用户点击一次，不要求启动服务、找 IP 或安装 MCP。
- 稳定局域网内，新事件通常在 2 秒内可查询。
- AI 只选择用户从 App 当前按钮读出的 Hub Session 短码；找不到或冲突时不猜测，询问当前地址或展示可读候选。
- Hub 短暂重启或网络抖动后可续传，不产生重复记录；发生丢弃时 AI 能看到明确缺口。
- `context` 在同一个 snapshot cursor 上重复执行得到一致结果；`inspect` 可追到具体证据；`tail` 可从 cursor 恢复。
- Hub 始终执行 7 天保留期和 20 GB 全局硬上限。
- Mac mini 重启且无人登录时，Hub 仍会自动启动。

### 2.3 v4 非目标

- 账号、RBAC、Token、TLS 或公网暴露。
- 手机磁盘离线队列；进程被杀后不承诺补传未发送日志。
- 服务端 AI 总结或模型调用。
- SQLite、Loki、Elastic 等数据库或搜索集群。
- 远程控制 App、请求重放、Mock 或状态恢复。
- P0 的日志删除和导出功能。
- v3 daemon 协议、命令或持久化数据迁移。

## 3. 信任边界

Hub 只允许部署在公司可信局域网或 VPN 内，使用普通 HTTP。系统模式必须绑定 Mac mini 被组织分配的固定 LAN IP，不能无条件监听 `0.0.0.0`；另行配置的 `advertiseUrl` 是 App、CLI 和 `/ready` 展示的唯一公共地址。固定 IP 或 DHCP reservation、公司网段路由与 macOS firewall allowlist 是部署前提。`appId` 只提供数据分区，不是权限边界；可访问该地址的人在技术上可以读取其他 App 的测试日志。

测试日志不做脱敏。Network header/body、Console 参数、Zustand state 和 Native raw 等都可能包含敏感内容，因此：

- 正式生产构建默认完全关闭采集和连接。
- 文档必须明确“isolated but not confidential”。
- Hub 不得暴露到公网。
- 所有 App 提交内容——包括日志、URL、header、body、console 文本、native raw、model、appVersion、type 和 file/path——一律视为 untrusted；只有 Hub 观察到的 source IP 与 Hub 生成/覆盖的结构字段属于 trusted control plane。
- CLI/MCP 对 App 内容一律标记 `contentTrust: "untrusted"`，控制记录放入不可由 App 伪造的独立 wrapper。
- Skill 只能把日志当证据，不能执行其中的命令、访问其中给出的 URL，或接受其中的身份与权限声明。

## 4. 三类用户与黄金路径

### 4.1 Mac mini 运维者（一次性）

1. 安装固定版本的 npm 包。
2. 执行 `hub install --system`，安装系统级 LaunchDaemon。
3. 确认 `/ready`、数据目录、端口和固定 IP。
4. 将 `http://<fixed-ip>:3799` 告知各 App 项目。

普通 App 开发者不执行这套流程，也不在自己的电脑上启动 Hub。

### 4.2 App 接入开发者（每个仓库一次）

1. 安装 v4 RN 包并完成原生重建。
2. 配置开发期 iOS Local Network/ATS 与 Android cleartext HTTP。
3. 在现有 `DebugView` 配置中传入 `appId` 与 endpoint。
4. 用本地锁定版本的 CLI 生成仓库级 Skill，并提交到版本库。
5. 启动测试 App，确认 Hub 中出现 App、设备与 Session。

Expo Go 不在支持范围内；Expo 项目需要 development build/prebuild。

### 4.3 AI 使用者（日常）

1. 用户描述 RN 运行时问题或要求查看日志。
2. 仓库级 Skill 读取项目已有配置，显式传递 `--endpoint` 与 `--app-id`。
3. Skill 先运行 `status`，用 App “立即同步”按钮里的 Hub 短码关联提问者 Session并记录刷新基线；之后才让用户点击，确认同一 Session 的刷新时间严格推进，再执行 `context → inspect`。只有需要现场复现时才运行有时限的 `tail`；崩溃场景改为让用户确认 stale 候选。
4. AI 给出带置信度、entryId 与源码关联的诊断；默认不修改代码。

## 5. App 配置与极简 UI

### 5.1 复用现有配置入口

不新增配置文件。v4 使用现有 `DebugView → features.devConnect`：

```tsx
features={{
  devConnect: {
    appId: appConfig.appId,
    endpoint: 'http://10.20.4.10:3799',
  },
}}
```

约束：

- `appId` 直接复用业务 App 已有固定值，App 内不可编辑。它必须是组织内唯一且稳定的产品标识，长度 1–128，只允许 `[A-Za-z0-9._-]`；同一产品的 iOS/Android 使用同一值，需要隔离的环境或品牌才使用不同值。Hub 拒绝非法值；首次 Session 为 `appId + platform` 绑定 native application id，之后发现不同值时以 409 `APP_ID_CONFLICT` 拒绝 open，避免日志先混入再报警。
- endpoint 是 **origin**，不是任意 URL：只允许 `http`、非空 host 和可选端口；拒绝 credentials、非根 path、query、fragment 与 HTTP redirect。输入纯 IPv4/hostname 时补为 `http://<host>:3799`，末尾 `/` 统一移除。`localhost`、loopback 只允许本地前台模式；公共模式的 IP 或内部 DNS 每次新连接都必须解析到 RFC1918 私网地址，解析到公网即拒绝。App、CLI 与安装器共用同一规范化/校验实现。
- 构建配置 endpoint 是唯一持久真源。输入框编辑只形成当前 App Runtime 的临时 override，冷启动即恢复构建配置；完全忽略且不迁移 v3 保存的电脑 IP/端口，也不新增 v4 preference key。这样日常 AI 与 App 不会长期漂移到不同 Hub。
- 用户编辑完成并按 Return 或失焦时才校验和提交 endpoint；空值提交会清除本 Runtime override 并恢复构建配置。非法值不保存，也不切换连接。
- endpoint 一旦改变，App 先尽力 flush 旧 Hub，然后废弃旧 Hub 的 in-flight 数据，在新 Hub 创建全新 Session，sequence 从 1 开始，并从当前 snapshot 重新入队；一个 Session 永远不跨 Hub。
- Skill 无法直接读取手机 Runtime override，因此不会仅凭 canonical Hub 上“恰好一个 active Session”认定目标设备；它按 12.2 让用户提供按钮中的 `hubRef-sessionRef`。先比较 `/ready` 的 Hub ref，再查 Session ref；Hub ref 不同就必须询问输入框当前地址，不能在错误 Hub 上因 Session 短码碰撞而读取同事日志，也不能直接断言 App 离线。
- CLI 不解析或执行任意 TS/JS 配置；Skill 由 AI 读取项目代码后显式传参。
- 现有 Toolkit `enabled` 是总开关；省略时只在 `__DEV__` 为 true 时启用。内部 release/QA 构建必须由业务 build channel 显式启用，正式生产 channel 必须显式关闭。例如：

```tsx
const debugToolkitEnabled = __DEV__ || appConfig.buildChannel === 'internal';

<DebugView enabled={debugToolkitEnabled} features={debugFeatures} />
```

P0 不新增 `autoSync` 参数，Toolkit 启用时默认实时同步。原生网络接入采用以下固定方式，不能只留给业务方猜配置：

- bare React Native：包提供可复制的 iOS `.xcconfig`/Info.plist 合并说明和 Android manifest placeholder；业务方只在 dev/internal scheme 或 variant 注入 Local Network/ATS、`NSLocalNetworkUsageDescription` 与 cleartext，production variant 不注入。
- Expo prebuild：包提供 config plugin，根据同一个 `enabled`/build channel 生成等价 iOS/Android 配置；重复 prebuild 必须幂等，production profile 不生成局域网例外。
- iOS 首次 Local Network 权限被拒绝后，Hub 地址输入框保持权限错误态；再次点击“立即同步”会调用系统 API 打开本 App Settings 页面并停止本次同步。Android 网络策略错误也由同一按钮进入明确的构建配置说明，不假装能在运行时修改 manifest。

### 5.2 UI 只有三个控件

```text
[ Hub 地址输入框 ]
[ 立即同步 · #K7M2Q9-A7F2 ] [ 暂停/恢复实时同步 ]
```

不增加设备列表、端口输入、Token、权限、二维码或高级设置。

连接状态只通过这三个控件本身的文字、颜色、状态点、disabled/loading 状态和输入框错误态表达，不新增常驻副标题；短暂 toast 只负责解释，不能成为唯一错误信号：

- `connecting`：按钮进入 loading。
- `connected`：完成 Session handshake，且 45 秒内至少有一次 heartbeat 或 batch ACK；实时同步按钮显示“暂停实时同步”。
- `paused`：显示“恢复实时同步”，暂停只对当前 Runtime 有效，冷启动重新默认同步。App 仍发送带 `syncState: paused` 的心跳，因此 Hub 能区分“在线但暂停”和“离线”。
- `retrying / hub_unreachable / hub_not_ready / storage_full`：按钮保持常驻错误色和简短状态，网络类错误继续重试，toast 给出具体原因。
- `protocol_mismatch`：停止无意义重试，提示升级 App 或 Hub。
- `invalid_config`：不发起连接，endpoint 输入框保持错误态。
- 单条事件被永久拒绝时保持连接，但按钮显示 warning 状态，Hub/AI 能读取对应 rejection 控制记录。

Session open 成功后，“立即同步”按钮在原文字内显示 Hub 返回的 `hubRef-sessionRef` 定位码；这仍是同一个按钮，不增加副标题、标签或第四个控件。`hubRef` 标识当前 Hub instance，避免 Runtime override 与 canonical Hub 恰有相同 Session 短码；尚未 open 时不显示定位码，并以现有错误态表达原因。

“立即同步”不会创建新 Session。它会刷新当前 feature snapshot 中尚未入队的事件、立即尝试 flush，并写入普通的 untrusted App event `toolkit.manual_sync`；Hub 只从自己的 `receivedAt` 派生 `lastManualSyncAt`，它只证明**已经用短码选定的 Session**最近完成刷新，绝不承担身份判断，也不把事件内容升级为可信控制。在 paused 状态下完成一次性同步后仍保持 paused，在离线状态下则进入发送缓冲并立即触发重试。

## 6. 设备、Session 与可读标识

### 6.1 Session 生命周期

- 每次 App 进程或 JS Runtime 冷启动创建新的随机 `sessionId`。
- `sessionId` 同时是可靠传输流的身份，永不跨冷启动复用。
- 前后台切换、暂停/恢复实时同步和“立即同步”都沿用当前 Session；只有冷启动、endpoint 变更或 Hub 返回 `SESSION_EXPIRED` 才创建新 Session。
- App 进入后台前尽力 flush 并写入状态事件；回到前台立即恢复握手。
- Hub 以 Session 为日志查询、cursor 和完整性判断的最小单位。
- Session 有正交的连接状态 `active | stale` 与同步状态 `live | paused`。45 秒内有成功请求即为 active；paused 仍可 active，但 context 必须提示暂停以来日志可能不完整。

### 6.2 设备元数据

Session open 时 App 上报：

- platform
- OS version
- manufacturer / brand（可获得时）
- model
- App version
- build number
- native application id（iOS bundle identifier / Android applicationId，仅用于冲突诊断）

Hub 从实际 socket 连接读取来源 IP，不信任客户端传入的 IP，也不信任 `X-Forwarded-For`。

### 6.3 唯一的人类标识

所有设备候选、Web Console 和 CLI 使用同一行格式：

```text
iOS 18.5 · iPhone 15 Pro · 10.20.4.36 · v3.2.1(482) · 8秒前
Android 15 · Xiaomi 14 · 10.20.4.58 · v3.2.1(482) · 1分钟前
```

字段固定为：

1. platform + OS version
2. 去重后的 manufacturer/brand + model
3. Hub 观察到的来源 IP
4. App version + build number
5. 相对最后活跃时间

模拟器不是常驻字段；检测到时才在 model 后追加“模拟器”。内部 `deviceId` 可由 `appId + platform + manufacturer/model + source IP` 的规范化值与短 hash 生成，但它不作为全局唯一安装身份。真正定位日志依靠随机 `sessionId`；Hub 另返回 6 位大写 Base32 `hubRef` 与由 Session 派生的大写十六进制 `sessionRef`（通常 4 位，同 Hub/appId 保留窗口内碰撞时扩展到 8 位）。按钮组合显示 `#K7M2Q9-A7F2`；当两条可读设备标识完全相同时，候选行末尾只追加 session 部分 `· #A7F2`，平时不增加字段。即使两个 Session 落入同一 device 目录也不会互相覆盖。

## 7. v4 事件协议

### 7.1 干净升级

- npm 包发布为 v4。
- 新 API 从 `/api/v1` 开始。
- 删除旧 `/report`、`/ingest`、`/devices/latest` 与 `--daemon-only`。
- 不读取、不转换、不自动删除旧 `daemon-devices.json`。
- v4 不读取 v3 endpoint preference，也不新增持久化 override；Runtime 临时地址在冷启动后消失。
- v4 App/CLI 在 `/ready` 与 Session open 握手中发现 API major 不匹配时返回 `PROTOCOL_MISMATCH` 与明确升级动作。v3 客户端本身不在支持范围内，访问已删除路由可以得到 404；Hub 不为它保留 tombstone handler。

### 7.2 Session open

App 通过 `POST /api/v1/apps/:appId/sessions` 建立或恢复 Session。客户端只提交业务元数据：

```json
{
  "protocolVersion": 1,
  "canonicalVersion": 1,
  "sessionId": "2f4890de-...",
  "startedAt": 1786429000000,
  "clientAckThrough": 127,
  "device": {
    "platform": "ios",
    "osVersion": "18.5",
    "manufacturer": "Apple",
    "model": "iPhone 15 Pro",
    "appVersion": "3.2.1",
    "buildNumber": "482",
    "nativeApplicationId": "com.example.app.ios"
  }
}
```

Hub 返回：

```json
{
  "ok": true,
  "protocolVersion": 1,
  "canonicalVersion": 1,
  "sessionId": "2f4890de-...",
  "hubRef": "K7M2Q9",
  "sessionRef": "A7F2",
  "bindingEpoch": 1,
  "deviceId": "ios-iphone15pro-10-20-4-36-a7f2",
  "generation": "opaque-random-fencing-token",
  "ackThrough": 127,
  "expectedSequence": 128,
  "rejected": [],
  "serverTime": "2026-08-11T10:16:40.000Z"
}
```

`clientAckThrough` 是可变的传输恢复提示，不属于 Session identity metadata；首次 open 为 0，恢复时是 App 最后实际收到的 ACK。每次成功 open 都签发新的随机 generation，并使旧 generation 失效；generation 只做并发 fencing，不是权限凭据。open、generation 变更、events commit 共用同一 Session writer lock；新 generation 先写入 ledger 并 `fsync`，再返回 open 响应。events 在获得锁后、append 前必须再次校验 generation。App 侧所有重新 open 由一个 single-flight 状态机负责，heartbeat 和 events 不能各自并发换 generation。

重复 open 必须携带完全相同的 Session/App/device 元数据，否则返回不可重试的 `SESSION_METADATA_CONFLICT`。Hub 在耐久 identity registry 中拒绝同一个 `sessionId` 被不同 appId 复用并返回 `SESSION_ID_CONFLICT`；同一 `appId + platform` 当前 binding epoch 的 `nativeApplicationId` 不同则返回 `APP_ID_CONFLICT`，不会创建 Session 或写入事件。Session ledger 删除后，其 tombstone 额外保留 7 天；窗口内重用返回 `SESSION_EXPIRED`，App 必须创建新 Session，tombstone 到期后不再承诺识别该随机 UUID。

首次创建返回 HTTP 201，恢复已有 Session 返回 200。path/body 无效返回 400；API major 不匹配返回 426；Session 已过期返回 410。客户端每次 events/heartbeat 前必须先成功 open，不能把 HTTP 连接本身当作 Session 身份。

### 7.3 Wire event 与落盘 envelope

App 上传的 event 只包含客户端字段，不能指定 Hub 保留字段：

```json
{
  "sequence": 128,
  "timestamp": 1786429000123,
  "type": "network",
  "severity": "error",
  "data": {},
  "payloadHash": "sha256-of-canonical-client-event"
}
```

`POST /api/v1/apps/:appId/sessions/:sessionId/events` 的请求体为：

```json
{
  "generation": "opaque-random-fencing-token",
  "firstSequence": 128,
  "events": []
}
```

Hub 校验 path、generation、连续 sequence 和 canonical payload hash 后，生成并覆盖 `recordKind`、`schemaVersion`、`entryId`、`appId`、`deviceId`、`sessionId`、`sequence`、`receivedAt`、规范化 severity 与 `contentTrust`。App 不能通过 `data` 或自定义 type 伪造这些字段。

Hub 落盘后的每一行都是自包含 JSON：

```json
{
  "recordKind": "event",
  "schemaVersion": 1,
  "entryId": "2f4890de-...:128",
  "appId": "com.example.app",
  "deviceId": "ios-iphone15pro-10-20-4-36-a7f2",
  "sessionId": "2f4890de-...",
  "sequence": 128,
  "timestamp": 1786429000123,
  "receivedAt": "2026-08-11T10:16:40.234Z",
  "type": "network",
  "severity": "error",
  "contentTrust": "untrusted",
  "payloadHash": "sha256-of-canonical-client-event",
  "data": {}
}
```

约束：

- 去重键固定为 `(sessionId, sequence)`。
- `sequence` 是从 1 开始、单 Session 单调递增的安全整数。
- `entryId = sessionId + ":" + sequence`，在 Hub 内全局唯一，因此 CLI 可只接受一个 `entryId`。
- `timestamp` 来自 App，只用于还原发生时间；保留期、活跃状态和跨请求提交顺序使用 Hub 的 `receivedAt`。
- 每条记录都保存 `schemaVersion`，为未来迁移保留边界。
- severity 规范化为 `debug | info | warn | error | fatal`；Network 失败、HTTP 4xx/5xx 至少映射为 error，同时完整保留原始字段。
- `payloadHash` 使用 canonical version 1 编码后的 SHA-256；canonical bytes 是 `{sessionId, sequence, timestamp, type, severity, data}` 的 RFC 8785（JCS）结果，不包含 generation、`receivedAt` 或其他 Hub 字段。进入 JCS 前，App instrumentation 递归执行固定归一化：`undefined → {"$type":"undefined"}`；function/symbol → `{ "$type": "function" | "symbol", "name": <name-or-empty> }`；BigInt → `{ "$type":"bigint", "value":<base10> }`；NaN/±Infinity → `{ "$type":"number", "value":"NaN" | "Infinity" | "-Infinity" }`；Date → `{ "$type":"date", "value":<ISO-8601-or-null> }`；binary → `{ "$type":"binary", "encoding":"base64", "bytes":<original>, "value":<budgeted-base64> }`；循环引用 → `{ "$type":"circular", "path":<RFC-6901-pointer-to-first-occurrence> }`。`-0` 按 JCS 成为 `0`；普通 object 只读取 own enumerable string keys，getter 抛错转为 `{ "$type":"property-error", "name":<Error.name> }`；字符串保持原 Unicode code points，不额外做 NFC/NFD。归一化时先按稳定 key 顺序遍历，所有 name/value 仍受 7.4 预算缩减；这些 tag 在 canonical version 1 的 patch/minor 中不得改变。
- App、Hub、CLI 共用 canonical version 1 的实现和跨平台 golden vectors，覆盖键顺序、数字边界、`-0`、Unicode、上述非 JSON 值与循环结构。Session open 的 `canonicalVersion` 不匹配时返回 426 `PROTOCOL_MISMATCH`，绝不能尝试用另一版本 hash。
- Hub/CLI 自己产生的控制记录使用 `recordKind: "control"` 与 `contentTrust: "trusted-control"`，放在独立 envelope 中；App 事件永远只能成为 `recordKind: "event"`。

### 7.4 64 KiB 单条上限

`64 KiB` 明确定义为最终单行 JSON（不含结尾换行）的 UTF-8 序列化结果最多 65,536 bytes。协议给 client wire event 固定 60 KiB（61,440 bytes）预算，并为 Hub envelope 保留 4 KiB；appId、session/device id、type 及设备元数据本身都有独立长度限制，保证保留区不会溢出。

协议字段上限固定为：`sessionId` 必须是 canonical UUID v4（36 ASCII chars）；`sequence` 为 `1..Number.MAX_SAFE_INTEGER`；`payloadHash` 为 64 个小写 hex；`type` 匹配 `[A-Za-z0-9._-]{1,64}`；platform 最多 16 UTF-8 bytes，OS version/manufacturer/app version/build number 各 64 bytes，model 128 bytes，native application id 200 bytes；Hub 生成的 `deviceId` 最多 96 ASCII chars、`entryId` 最多 53 ASCII chars、generation 最多 64 ASCII chars、`hubRef` 固定 6 个大写 Base32、`sessionRef` 通常 4 个大写 hex，同一 appId 的 retained Sessions 发生碰撞时扩展为 8 个。超限元数据在 Session open 直接返回 `INVALID_ARGUMENT`，不能悄悄截断身份字段。

App 在事件进入 pending 前先做初步结构化缩减；事件移入 in-flight、获得 sequence 后，再使用最终 sequence 生成 canonical bytes、完成 60 KiB 复验并计算 payload hash。Hub 生成 envelope 后执行最终 64 KiB 复验。

缩减必须保持合法 JSON 和完整 UTF-8 字符，不能直接切字节。固定保留 envelope、level/status、URL/method 与诊断标识，优先缩减：

1. response body
2. request body
3. Zustand/state 与 Console 大参数
4. headers
5. 其他长字符串

结果包含 `truncated: true`、`originalBytes`，并保留有意义的头尾预览。App 无法缩到 60 KiB 的事件不会获得 sequence，而是计入下一条 untrusted `toolkit.buffer_overflow` event；Hub 若因 envelope/schema 校验永久拒绝一个已编号事件，则按 8.3 的 rejection tombstone 规则推进 ACK，不能让队列永久卡死。该机制是稳定性截断，不是脱敏。

## 8. App → Hub 可靠传输

### 8.1 HTTP 批量上传

App 不使用 WebSocket。50 条和 512 KiB 同时是 batch 的硬上限；512 KiB 按完整 HTTP JSON body 的最终 UTF-8 字节计算，包含 generation、数组和协议字段。构建 batch 时，如果加入下一条会超过任一上限，就先发送当前 batch，绝不把整个 2 MiB 缓冲一次发出。

触发以下任一条件即尝试构建并 flush：

- 距离上次 flush 1 秒；
- 累计 50 条；
- 下一条会使 batch 达到 512 KiB；
- 产生 error/fatal；
- 进入后台或用户点击“立即同步”。

同一 Session 同时只允许一个 batch in-flight，避免乱序。

### 8.2 两阶段内存发送缓冲

发送缓冲由 `pending` 和 `in-flight` 两部分组成，总硬上限为 500 条或 2 MiB 最终序列化字节，先到者为准：

- `pending`：已规范化但尚未编号，可按价值淘汰。
- `in-flight`：已分配连续 sequence，直到收到 ACK 都不可修改、重排或淘汰。

pending 的字节计量使用规范化 payload 加固定的 sequence/hash/envelope 最坏预算，in-flight 使用实际 canonical wire bytes。转移前先用拟分配 sequence 重新计算精确字节；若总量仍会超限，先淘汰其他 pending 并记录 overflow，确认在 500 条/2 MiB 内后才真正分配 sequence。无法腾出空间就保持未编号并丢弃该 pending，绝不能先编号再突破硬上限。in-flight 单批最多 512 KiB，为新高优先级 pending 事件留下可淘汰空间。

sequence 只在事件从 `pending` 移入 `in-flight` 时分配。这样缓冲满载时优先删除最老 debug/info、成功 Network 等低价值 pending 事件，不会制造永久 sequence 空洞；之后才删除其他最老 pending 事件。系统为一条轻量 untrusted diagnostic event 预留空间，恢复后上传按类型和原因汇总的 `toolkit.buffer_overflow`。

发送缓冲不写手机磁盘，也不承诺 App 被杀后的恢复。它只解决进程存活期间的短暂 Hub 重启、Wi-Fi 抖动和局域网权限初始化。

### 8.3 ACK、去重与重试

events 请求必须携带当前 generation，batch 内 sequence 必须连续。`firstSequence > expectedSequence` 是 gap 并拒绝整批；`firstSequence <= expectedSequence` 允许 ACK 丢失后的重复前缀，Hub 跳过已 ACK 部分后要求剩余第一条恰好等于 expectedSequence。失效 generation 返回 `409 STALE_GENERATION`，客户端重新 open Session 后按返回的 `expectedSequence` 对齐：

- 只有完整执行 9.2 的 segment、ledger 与 manifest durability transaction 后，才返回累计 `ackThrough`。
- App 只能删除 `sequence <= ackThrough` 的 in-flight 事件。
- ACK 丢失后 App 原样重发；Hub 对已落盘的相同 `(sessionId, sequence)` 幂等 ACK，不写第二行。
- 对已 ACK 的重复前缀，Hub 绝不覆盖或再次写入：原记录仍 retained 时比较 payloadHash，不同则返回不可重试的 `SEQUENCE_CONFLICT`；原记录已落入明确 retention gap 时无法再比较，返回相同 ACK 并附 `duplicate_not_verifiable` 完整性 warning。
- 收到高于预期的 sequence 时拒绝整批并返回 `expectedSequence`，App 从该位置重发。
- 新连接接管 Session 后，旧连接的 generation 失效，避免两个并发发送者交错写入。
- 一个 batch 只 ACK 最大连续且已持久化的前缀。
- Hub 在 append 前逐条校验。某个已编号事件发生不可恢复的 schema/size 错误时，Hub 在同一 sequence 写入服务端生成的 `event_rejected` control tombstone，记录 reason、原 type、payloadHash 和 originalBytes，随后可继续提交连续后缀。响应同时返回 `rejected[]`，但 `ackThrough` 可以越过已持久化的 tombstone；客户端删除相应 in-flight 并显示 warning。
- 如果格式合法但 Hub 重算的 canonical hash 与 `payloadHash` 不同，整批返回 409 `PAYLOAD_HASH_MISMATCH`、不写 tombstone 也不消费任何 sequence；这表示客户端 canonical 实现或 payload 已改变，App 停止当前 Session 并显示协议 warning。
- 每个 rejection 摘要同时进入 ledger 的 pending rejection index。正常 events 响应和恢复 open 都返回 `(clientAckThrough, ackThrough]` 内的 `rejected[]`；App 只有实际收到响应后才推进本地 clientAckThrough。后续 events 的 `firstSequence - 1` 或 heartbeat/open 的 `clientAckThrough` 证明通知已收到，Hub 才可从 ledger checkpoint 丢弃对应摘要。因此 ACK/open 响应丢失后，rejection warning 会幂等重放，不依赖 JSONL segment 仍 retained。

成功响应至少包含：

```json
{
  "ok": true,
  "ackThrough": 177,
  "expectedSequence": 178,
  "rejected": []
}
```

重试分类：

- timeout、连接失败、408、429、5xx：指数退避并加入 jitter；遵守 `Retry-After`。
- 单事件 schema/size 错误：由 Hub 写 rejection tombstone 后 ACK。
- 非事件级普通 4xx、`PAYLOAD_HASH_MISMATCH`、`SEQUENCE_CONFLICT`、`SESSION_METADATA_CONFLICT`：停止当前 Session，明确要求修复或创建新 Session。
- `PROTOCOL_MISMATCH`：停止重试，等待升级。
- 507 `STORAGE_FULL`：保留缓冲并按 5xx 策略重试，同时保持 App 常驻错误状态。

退避从 1 秒开始，最高 30 秒；连接恢复后立即重发 in-flight，再处理 pending。

### 8.4 HTTP 心跳与活跃状态

- App 前台空闲时每 15 秒发送 heartbeat，加入小幅随机抖动。请求体为 `{ generation, syncState: "live" | "paused", clientTime, clientAckThrough }`；失效 generation 触发重新 open。
- 任意成功上传或心跳都更新 Hub `lastSeenAt` 并重置空闲计时。
- 心跳不分配 sequence、不写 JSONL，也不改变日志保留时间。
- 连续 45 秒没有成功心跳或上传后，Hub 将 Session connectionState 标为 stale。paused Session 继续心跳，因此仍可 active，但 `syncState` 必须单独返回，不能伪装成正在持续上传。
- App 进入后台后暂停心跳；回到前台立即 heartbeat/handshake，并沿用当前 Session 与未 ACK batch。

heartbeat 成功返回 HTTP 200 与 `{ ok, lastSeenAt, connectionState, syncState }`；generation 失效返回 409 与新 open 动作。events 成功或带 rejection tombstone 的部分降级都返回 200；无法解析到 sequence 的整包 JSON/schema 错误返回 400 并停止当前 Session，避免 poison batch 无限重试。

## 9. Hub 存储

### 9.1 目录与索引

保留下来的事件以 JSONL 为事实来源；可靠传输高水位与 retention 缺口由独立、耐久的 Session ledger 负责。为了进行全局容量清理，每个 Session 物理拆成 16 MiB 或 1 小时的 segment：

```text
data/
  identity-registry.json
  cursor.key
  hub-index.json
  <safe-app-id>/
    <device-id>/
      <session-id>.manifest.json
      <session-id>.ledger.jsonl
      <session-id>.000001.active
      <session-id>.000001.jsonl
      <session-id>.000002.active
```

所有来自 `appId`、device 与 session 的路径片段必须规范化并附 hash，禁止路径穿越。`hub-index.json` 是可从 manifest/ledger 重建的查询缓存；`identity-registry.json` 则是耐久事实源，保存首次初始化生成的 128-bit `hubInstanceId` 及其 6 位展示 `hubRef`、每个 `appId + platform` 的 native application id、单调 `bindingEpoch`、归档绑定/audit，以及 ledger 删除后额外保留 7 天的 Session tombstone。Hub identity 和 App binding 不随日志 retention 自动消失，只能由显式本机恢复/管理命令变更。registry 在全局锁内通过 temp write → file fsync → atomic rename → parent directory fsync 更新，失败时不接受相关 Session open；它与 tombstones 一并计入 20 GB。

`cursor.key` 是首次初始化时生成的 32-byte 随机 HMAC key，权限为 service user only；创建时 file fsync + parent directory fsync 完成前 `/ready` 不成功。event/baseline/snapshot cursor 都携带 kind 与 signer version 并由该 key 防篡改。key 在 runtime 更新、数据保留式卸载与 v4 回滚中原样保留，P0 不自动轮换；已有数据却缺 key 时 `/ready` 失败，管理员只能执行显式 cursor reset，让所有旧 cursor 统一变为 `CURSOR_INVALID`，不能悄悄签发新 key 后假装可续读。

Session ledger 是可独立恢复状态的追加日志，记录 `session_open` 全量元数据、bindingEpoch 与 startedAt、generation 变更、合并后的 `lastSeenAt/syncState` checkpoint、每次 batch commit 的连续高水位与文件 offset、segment rotation，以及 retention deleting/gap；即使旧事件 segment 被清理也保留去重/恢复边界。manifest 是 ledger 与当前文件状态的原子 checkpoint，保存：

- metadata、device label、lastSeenAt 与 active 状态；
- `ackThrough`、generation、当前未结束 batch 的 payload hash 与尚未被客户端确认的 rejection summaries；
- segment 的字节数、事件数、首末 `receivedAt`、首末 sequence；
- `truncated`、被删除的事件数与最早可用 cursor。

`hub-index.json` 可完全重建。manifest 损坏时由 ledger 加仍保留的 JSONL 恢复；ledger 不是可丢弃缓存，只有 Session stale 且最后活动超过 7 天后才能随 Session 一起删除。

ledger 达到 1 MiB 或 10,000 条记录时，Hub 在 Session 锁内写入包含完整 Session 元数据、当前 generation、lastSeen/syncState、高水位、pending rejection summaries、全部现存 segment 与 gap 汇总的新 checkpoint，`fsync` 临时文件后原子替换旧 ledger，并 `fsync` 父目录；目录持久化完成前不报告 compaction 成功，崩溃后旧版或新版 ledger 必须至少有一个完整可读。首次创建 ledger 同样先 `fsync` 文件和父目录，再返回 Session open。启动读取 ledger 时忽略并截断末尾不完整或校验失败的半行；若最后完整 checkpoint 也无法校验，`/ready` 失败并报告损坏文件，不猜测 ACK。

### 9.2 Append、rotation 与崩溃恢复

- `16 MiB = 16 × 1024 × 1024 bytes`，包含 JSON 字节和换行符。
- 如果写入下一行会超过 16 MiB，或 active segment 已持续 1 小时，先封存当前 `.active`，原子 rename 为 `.jsonl`，再创建新 segment。时间 rotation 保证低流量长寿命 Session 也能执行 7 天清理。
- 一条事件恰好占一行；内容换行由 JSON 转义。
- 同一 Session 只有一个 writer；append、rotation、清理和查询通过 Session 级锁协调。
- 一个 batch 可以跨 segment。提交顺序固定为：写入全部事件行 → `fsync` 所有受影响 segment → 完成必要 rename 并 `fsync` 父目录 → 向 ledger 追加包含文件 offset 和 `ackThrough` 的 commit 并 `fsync` → 用临时文件原子替换 manifest 并 `fsync` 父目录 → 返回 ACK。ledger/manifest 高水位永远不能领先事件数据。
- append 后 ledger commit 前崩溃时，启动按最后一个已提交 offset 截掉未提交尾部，客户端重发；ledger commit 后 ACK 前崩溃时，重启返回已提交 `ackThrough`，不会重复落盘。
- 启动时截断不完整的最后一行，只保留最后一个合法换行之前的数据。
- 恢复使用最高“连续且已 commit”的 sequence，不能简单取文件里的最大值。

### 9.3 7 天与 20 GB 清理

两个规则采用 OR 语义：

- segment 最后 `receivedAt < now - 7 days`；或
- `/Users/Shared/ReactNativeDebugToolkitHub` 下全部**可变数据**（event data、identity/cursor state、Hub runtime logs 与 bootstrap logs；不含只读 versioned runtime binaries）超过 `20,000,000,000 bytes`。

清理在启动时、固定周期以及写入即将超限时执行：

1. 按 Hub `receivedAt` 从全局最老的 closed segment 开始删除。
2. 需要删除 active segment 时先 rotate，再删除封存文件。
3. 不删除正在被查询的文件；等读取引用释放后再 unlink。
4. 删除采用可恢复状态机：先在 manifest/ledger 标记 `deleting` 并持久化，再 unlink 和 `fsync` 父目录，最后提交 retention gap；启动时会完成中断的清理。
5. 删除任何 segment 后将 Session 标记 `truncated: true`，保留 ledger 的 ACK 高水位和缺口统计。
6. 如果无法删除到上限以内，Hub 返回 `507 STORAGE_FULL`，不能继续把系统盘写满。

7 天是保留策略而非逐行精确 TTL：按 1 小时 segment 清理时，一条事件最多可额外保留约 1 小时；20 GB 始终是立即执行的硬上限，容量清理可能让事件少于 7 天。CLI/Web 必须公开这个完整性语义。

删除普通 cursor 所在 segment 后，查询和 SSE 返回 HTTP 410 `CURSOR_EXPIRED`，在 `error.details` 中同时提供 `oldestAvailableSequence` 与 Hub 签发的 `resumeAfterCursor`。后者是 `kind: baseline` 的特殊不透明 cursor，表示“紧邻签发时最早保留 sequence 之前”，并绑定当时 ledger 的 `retentionGapVersion`；校验时只豁免该已声明 gap，不要求它对应事件仍存在。若使用前 gap version 再次前移，旧 baseline 也返回新的 410 与新 baseline，绝不静默跳过第二次清理。若已无任何 retained event，则 `oldestAvailableSequence: null`，baseline 定位到当前 `ackThrough`；新事件到达但 gap 未变化时可从其后正常续读，普通 events 查询此前返回空页和同一 next cursor，SSE 完成空 replay 后只等待新事件。

Session 不依赖显式 close：45 秒无成功请求只变为 stale，之后仍可在 ledger 保留期内恢复；stale 且最后活动超过 7 天后才删除 ledger/manifest 并写入 identity registry tombstone。之后 7 天内同一 `sessionId` 返回 `SESSION_EXPIRED`；tombstone 到期删除后，随机 UUID 可被当作新 Session，协议不提供永久防重承诺。

Session 过期转换在 global identity lock + Session lock 下执行可恢复状态机：先把含 appId/sessionId/ackThrough、`state: "preparing"` 与 requestedAt 的 tombstone 原子写入 identity registry 并完成 file/parent-directory fsync；再 unlink event segments、ledger、manifest，每个相关父目录都 fsync；最后以实际完成时间写入 `finalizedAt`、`expiresAt = finalizedAt + 7 days`，把 tombstone 改为 `state: "active"` 并再次原子持久化。`preparing` 已足以拒绝 reopen；启动发现它时，有残留文件就继续删除，无残留就 finalize。即使停机恢复超过 7 天，额外保留期也从 finalize 起算；绝不允许先删除最后一个 Session 事实文件、后补 tombstone。

## 10. Hub API

### 10.1 生命周期与写入

```text
GET  /health
GET  /ready

POST /api/v1/apps/:appId/sessions
POST /api/v1/apps/:appId/sessions/:sessionId/events
POST /api/v1/apps/:appId/sessions/:sessionId/heartbeat
```

`/health` 只表示进程存活。`/ready` 还必须验证协议初始化、索引可用、数据目录可写、未处于 `STORAGE_FULL`，并返回版本、运行时间、固定地址、完整 `hubInstanceId`、展示 `hubRef` 和存储用量。

### 10.2 查询与流

```text
GET /api/v1/apps/:appId/sessions
GET /api/v1/apps/:appId/sessions/:sessionId/context
GET /api/v1/apps/:appId/sessions/:sessionId/entries/:entryId
GET /api/v1/apps/:appId/sessions/:sessionId/events
GET /api/v1/apps/:appId/sessions/:sessionId/stream
```

约束：

- `appId` 与 `sessionId` 都在 path 中并由 Hub 交叉校验；entryId 内嵌的 session 与 path/CLI `--session` 不一致时返回 `INVALID_ARGUMENT`。不提供全局 `latest`。
- Session 列表严格按 Hub `lastSeenAt` 排序，并同时返回 active/stale 状态。
- `events` 支持时间、type、severity、文本、limit 与 cursor；最终结果始终按 sequence 排序。带过滤条件时 cursor 表示最后扫描到的 sequence，而不是最后一个匹配结果，避免翻页反复扫描或漏读。
- 普通 event cursor 是 Hub 编码并校验的不透明字符串，P0 只表示单 Session 内已持久化 sequence；baseline cursor 另带 retention gap version，snapshot cursor 带 capture 条件。三者都绑定 sessionId 和 signer version，不定义跨 Session 全局顺序，也不能用于另一个 Session；签名、kind 或参数不合法返回 400 `CURSOR_INVALID`，只有曾合法但所需数据被清理才返回 410 `CURSOR_EXPIRED`。
- SSE 使用标准 `id:`，`Last-Event-ID` 优先于 query cursor，从 cursor 之后开始发送。
- SSE 只发布达到 ACK 持久化边界的事件；keepalive comment 不产生 cursor。
- 慢客户端输出缓冲达到 512 KiB 时断开，由客户端使用最后 cursor 重连。
- SSE 建连时先在 Session writer 上固定 `capturedThrough` 并注册 live listener，再回放 cursor 之后至该边界的事件，最后按 sequence 去重并排空 listener buffer，避免 replay 与 live 之间出现丢失窗口。

所有错误使用稳定结构：

```json
{
  "ok": false,
  "error": {
    "code": "NO_SESSION",
    "message": "No retained session was found for this app.",
    "suggestedAction": "Open the test app and reproduce the issue.",
    "details": {}
  }
}
```

`details` 始终是对象，并按 code 使用固定 schema：Session 选择错误返回 `candidates[]` 和 `omittedCount`；`CURSOR_EXPIRED` 返回 `oldestAvailableSequence/resumeAfterCursor`；字段冲突返回冲突字段名。每个 candidate 把 Hub 字段放在 `control`（`contentTrust: "trusted-control"`，含 hubRef/sessionId/sessionRef/sourceIp/connectionState/syncState/lastSeenAt/lastManualSyncAt），把 App 元数据放在 `device`（`contentTrust: "untrusted"`，含 platform/OS/model/App build）；拼接后的可读 `label` 整体也降级标记为 `contentTrust: "untrusted"`，只用于展示。空结果、对象不存在、cursor 过期、协议不匹配和服务不可达不能都退化为空数组或普通文本。

### 10.3 Deterministic context

`context` 是确定性的规则引擎，不调用 AI。默认行为：

- 首次请求由 Hub 返回一个不透明 `snapshotCursor`，内部绑定 sessionId、**包含式** `throughSequence`、`capturedAt` 和影响选择的规范化参数摘要，并校验防篡改；响应同时显示这些字段便于审计。后续 query `through=<snapshotCursor>` 或 CLI `--through` 必须复用其中的 `capturedAt` 和参数，只读取 `sequence <= throughSequence`，不能在重放时重新取当前时间。
- 默认时间窗为 `capturedAt` 之前最近 10 分钟，窗口判断使用 Hub `receivedAt`，可由 `since/until` 或 CLI 显式覆盖。
- 最多选择 200 个事件，最终合法 JSON 不超过 128 KiB。
- 先按 sequence 从新到旧选择最多 50 条 error/fatal/失败 Network；每条加入前后各 3 个 sequence 相邻事件并去重；剩余配额按 sequence 从新到旧填充普通事件，最后统一升序输出。
- 最终统一按 sequence 排序，并返回每种类型的 selected/omitted 数量。
- 大 body/state 只给小预览与 `entryId`，完整已采集内容通过 `inspect` 获取。
- 返回 device/session metadata、选择条件、完整性状态、`truncated`、App `toolkit.buffer_overflow` 与 retention 缺口。
- 如果仍超过 128 KiB，按固定顺序先缩短 body/state preview，再移除最老的普通事件，最后移除最老的相邻事件；高信号事件本身只保留结构化摘要和 entryId。每一步都更新 omitted/warning，输出始终是合法 JSON。

只要相关 segment 仍保留，相同 `snapshotCursor` 必须返回相同事件集合；调用方另传与 cursor 摘要冲突的选择参数时返回 `INVALID_ARGUMENT`。如果 retention 已删除必要数据，则整个重放请求返回 410 `CURSOR_EXPIRED`，不能返回一个看似完整的新结果。

## 11. CLI

CLI 来自业务仓库锁定的 npm 依赖，日常使用：

```bash
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit status --endpoint <hub-url> --app-id <app-id>
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit context --endpoint <hub-url> --app-id <app-id>
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit inspect <entryId> --endpoint <hub-url> --app-id <app-id>
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit tail --endpoint <hub-url> --app-id <app-id>
```

CLI 接受 `--endpoint`、`--app-id`、`--session` 等显式参数；参数优先于 `DEBUG_TOOLKIT_HUB_ENDPOINT`、`DEBUG_TOOLKIT_APP_ID` 环境变量。CLI 不读取任意业务配置文件，也不在查询命令中隐式启动本地 Hub。仓库级 Skill 负责从源码读取 canonical 值并把它们放进每次实际命令；无法静态确定时只询问用户，不执行配置代码。

P0 正式支持 npm。monorepo 中 Skill 从当前文件向上找到最近一个声明 `react-native-debug-toolkit` 依赖的 `package.json`，确认对应安装树中存在该包和 bin，再在该 workspace 目录运行 `npm exec --no --package=react-native-debug-toolkit -- debug-toolkit ...`。`--no` 禁止缺包时从 registry 临时安装；依赖未安装就返回 `TOOLKIT_NOT_INSTALLED` 和当前仓库的安装动作。找到多个 workspace 候选时询问用户，不能从仓库根目录或 npm cache 下载 latest/同名 `debug-toolkit` 包兜底。

### 11.1 命令语义

- `status`：检查 Hub liveness/readiness，返回 Hub `serverTime`，并列出按 `lastSeenAt` 排序的 Session；每项严格使用上述 `control + device + label` trust schema。默认最多 50 个 Session、完整 JSON 最多 64 KiB，优先 active 再取最新 stale，同时返回总数和 omitted count。
- `context`：读取固定 snapshot cursor 的紧凑证据包。
- `inspect <entryId>`：解析全局唯一 entryId，直接按记录定位，不要求 Session active，也不接受/需要 `--allow-stale`。它返回“Hub 实际保留的完整记录”，而不是 64 KiB 规范化前的数据；完整 JSON（含 wrapper）最多 96 KiB，仍包含 `contentTrust: untrusted` 和任何截断标记。entry 所属 Session 仍在但 sequence 已落入已知 retention gap 时返回 410 `ENTRY_EXPIRED`，从未存在或无法证明曾存在才返回 404 `ENTRY_NOT_FOUND`。
- `tail`：订阅一个已确定的 Session，stdout 输出 NDJSON。无 cursor 时从调用瞬间的当前高水位之后开始，只观察新事件；传 `--cursor` 才续读历史。AI 默认运行 60 秒墙钟时间（重连时间也计入），或达到 200 条/2 MiB 最终 NDJSON 字节后成功退出；人类显式传 `--follow` 才无限运行。

tail 输出使用不可混淆的 wrapper：

```json
{"kind":"event","contentTrust":"untrusted","sessionId":"...","cursor":"...","event":{}}
{"kind":"control","contentTrust":"trusted-control","control":{"type":"selection_required","previousSessionId":"...","details":{"candidates":[]}}}
{"kind":"error","contentTrust":"trusted-control","error":{"code":"CURSOR_EXPIRED","message":"...","suggestedAction":"...","details":{"resumeAfterCursor":"..."}}}
{"kind":"end","contentTrust":"trusted-control","reason":"duration","cursors":[{"sessionId":"...","cursor":"..."}],"omittedCount":0}
```

CLI 每 2 秒检查同一 appId 的 Session 生命周期。选中 Session 发生 reload/冷启动后，tail **不得**因相同 deviceId 自动读取新 Session；它先发出 `selection_required` control 并正常结束，候选沿用 `control + device + label` trust schema，最多 10 个并带 `omittedCount`。Skill 让用户提供新按钮短码后启动新的 tail，保证确认之前不会输出另一个 Session 的事件。网络断线自动重连当前 Session；cursor 过期时输出上述 error 与 end 后非零退出。

tail 从 2 MiB 预算起始就保留 8 KiB 给一个 warning/error 和最终 end record。写下一条完整 event 前先同时检查“事件数 + 1”和“事件 bytes + trailer reserve”；放不下就不输出、也不推进该事件 cursor，以 `reason: "limit"`、`omittedCount >= 1` 和最后已输出 cursor 正常结束，下一次可无损续读。60 秒到期和达到预算不是 `TIMEOUT`，exit 0；SIGINT 尽力写 end record 后使用标准 exit 130。

JSON/NDJSON 只写 stdout；进度和诊断写 stderr。所有预算均包含 CLI/MCP wrapper。任何预算截断都通过结构化 warning、`omittedCount` 和合法 JSON 表达，不能直接截断输出字节。

### 11.2 Session 选择

- CLI 被人显式调用且未给 `--session` 时，45 秒内只有一个 active Session 可自动选择；这不是 Skill 关联提问者的依据，Skill 必须另走 12.2 的定位流程。如果它的 syncState 为 paused，仍可读取已有证据，但 status/context 必须警告“暂停以来日志可能不完整”，Skill 在启动 tail 前要求恢复同步。
- 多个活跃 Session：返回 `MULTIPLE_ACTIVE_SESSIONS` 与可读候选，不猜测。
- 没有 active Session 但 appId 有历史记录：自动选择返回 `APP_OFFLINE`；显式选择一个 stale Session 而未传 `--allow-stale` 时返回 `STALE_SESSION`。
- 没有记录：返回 `NO_SESSION`。

### 11.3 错误与退出码

稳定映射如下；MCP 使用相同 code，并把失败标为 `isError: true`：

| code | HTTP | CLI exit | 精确定义 |
| --- | ---: | ---: | --- |
| `INVALID_ARGUMENT` / `INVALID_CONFIG` / `CURSOR_INVALID` | 400 | 2 | 参数、路径中的 app/session/entry 互相冲突，本地配置无效，或 cursor 格式/签名错误 |
| `TOOLKIT_NOT_INSTALLED` | 无请求 | 2 | 当前 npm workspace 未安装锁定的 `react-native-debug-toolkit`，禁止远程兜底 |
| `HUB_UNREACHABLE` | 无响应 | 4 | DNS、连接或网络层无法到达 Hub |
| `HUB_NOT_READY` | 503 | 4 | 进程存活，但索引/数据目录尚不可用 |
| `NO_SESSION` | 404 | 3 | appId 在保留窗口中从未出现 Session |
| `APP_OFFLINE` | 409 | 3 | appId 有历史 Session，但当前没有 active Session |
| `STALE_SESSION` | 409 | 3 | 用户显式选中 stale Session，但没有允许读取 stale 数据 |
| `MULTIPLE_ACTIVE_SESSIONS` | 409 | 3 | 自动选择时存在多个 active 候选 |
| `ENTRY_NOT_FOUND` | 404 | 3 | entryId 从未存在，或不属于所给 app/session |
| `SESSION_EXPIRED` / `CURSOR_EXPIRED` / `ENTRY_EXPIRED` | 410 | 3 | Session ledger、cursor 或已知 entry 所需 segment 已过 retention |
| `PROTOCOL_MISMATCH` | 426 | 4 | v4 App/CLI 与 Hub API major 不匹配 |
| `TIMEOUT` | 504 或无响应 | 4 | 操作未在调用者规定时间内完成；正常 tail duration 不使用此码 |
| `STALE_GENERATION` | 409 | 4 | Session 被更新的 open 接管，需要重新握手后按 expectedSequence 恢复 |
| `PAYLOAD_HASH_MISMATCH` / `SEQUENCE_CONFLICT` / `SESSION_METADATA_CONFLICT` / `SESSION_ID_CONFLICT` / `APP_ID_CONFLICT` | 409 | 5 | 写入端破坏 canonical、可靠传输或 App 分区不变量 |
| `STORAGE_FULL` | 507 | 5 | Hub 无法在 20 GB 规则内继续写入 |
| `INTERNAL_ERROR` | 500 | 5 | 未归类的 Hub 内部失败 |

`status` 在 Hub ready 时始终 exit 0，并把 active/stale/paused 作为数据返回；只有连接或 readiness 失败才非零。`DATA_TRUNCATED`、`BUFFER_OVERFLOW`、`TAIL_LIMIT_REACHED` 等完整性问题是 exit 0 的结构化 warning，不能伪装成执行失败。

## 12. 仓库级 Skill

Skill 由 npm 包提供模板，但生成到业务仓库并提交：

```text
.agents/skills/react-native-debug-toolkit/SKILL.md
```

初始化：

```bash
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit init-skill
```

命令在目标存在时默认拒绝覆盖；更新必须显式确认或使用明确的覆盖参数。

生成文件记录 `toolkitMajor: 4` 与 `skillTemplateVersion`，但不复制一份 appId/endpoint 配置。`init-skill --check` 通过上述禁止远程兜底的命令加 `--version --json` 比较当前 workspace 包与模板，`init-skill --update` 才显式更新；运行时由 Skill 自己先执行同一版本命令并比较记录值，CLI 的 `status` 不需要也无法读取 Skill 文件。

P0 成功环境明确限定为：AI Agent 在业务仓库的开发者电脑上运行，能执行该 workspace 的只读 shell 命令，并能通过公司 LAN/VPN 直连 Hub。远程云 Agent 或禁网沙箱不满足条件，Skill 必须在 `HUB_UNREACHABLE` 后说明改用本地 Agent，不能建议开放公网。原生发现 `.agents/skills` 的 Agent 可自动触发；其他 Agent 的一次性接入方式是在其仓库指令文件中加入“RN 运行时诊断先完整读取 `.agents/skills/react-native-debug-toolkit/SKILL.md`”。`init-skill` 检测常见仓库指令文件并打印可复制片段，但不静默改写；验收至少覆盖一个原生发现宿主和一个通过仓库指令引用的宿主。

### 12.1 触发边界

自动触发：

- RN 运行时 API 失败、数据异常；
- 白屏、冻结、崩溃；
- navigation、track、Zustand 等运行时状态问题；
- 用户说“看日志”“刚才发生了什么”。

不触发：

- build、typecheck、lint、单元测试失败；
- 静态代码评审或一般技术问答；
- 用户明确要求只做静态分析。

### 12.2 固定操作流程

1. 在已确定的 npm workspace 中，只读查找当前 App 的 `DebugView/features.devConnect` 与已有 app config，静态解析 appId 和 canonical endpoint，并显式传给 CLI；不执行项目配置。无法唯一确定时询问用户。
2. 校验 Skill/CLI major 后运行 `status`，按标准错误码处理，不自行编造无日志诊断。App 报出 `APP_ID_CONFLICT` 时先让接入方修正 appId，禁止绕过冲突读取混合分区。
3. 对仍在运行的 App，先请用户只告知“立即同步”按钮中的 `hubRef-sessionRef`，暂时不要点击。先请求 canonical endpoint 的 `/ready`：hubRef 不同则不查询其 Sessions，直接询问地址输入框当前值并在该 endpoint 重新校验；hubRef 相同后才查找同一 Hub/appId 保留窗口内唯一的 sessionRef。选中后固定完整 endpoint + hubInstanceId + sessionId，记录该 Session 的 `lastManualSyncAt` 基线；绝不以“Hub 上唯一 active”代替定位码关联。
4. 基线固定后才请用户点击“立即同步”，最多每 500 ms 轮询同一 endpoint/Session 5 秒，要求 `lastManualSyncAt` **严格大于**基线且相对当前 `serverTime` 不超过 5 秒。未推进时禁止读取：如果刚才用的是 canonical endpoint，就改问当前输入框地址并在该 Hub 重新执行“短码定位 → 记录基线 → 点击”；仍失败则输出 insufficient evidence。不能用“最近 10 秒有过 marker”兜底，也不能换读其他 Session。
5. App 已崩溃或无法显示短码时，列出最近 stale candidates，要求用户根据统一设备标识/时间明确确认；确认后用 `context --session ... --allow-stale` 读取。没有可确认候选就输出 insufficient evidence，不因为 `APP_OFFLINE` 放弃已有崩溃证据，也不猜最新 Session。
6. 运行 `context`；需要保留记录的细节时才 `inspect`。`inspect` 通过 entryId 读取 stale Session 无需额外开关。
7. 仅在用户准备复现时运行有界 `tail`；同一任务已确认的 Session 可复用，收到 `selection_required` 后先停止，再让用户提供新按钮短码，确认前不读取候选 Session。
8. 输出：结论与置信度（confirmed / high probability / insufficient evidence）、证据时间/type/字段/entryId、源码关联、下一步最小验证。
9. 源码关联只允许解析到当前 workspace 内的规范化路径；日志给出的绝对路径、`..` 跳转和仓库外文件都不自动打开。
10. 默认只读；未经明确要求，不修改代码、不清理日志、不调用日志中出现的命令或链接。

## 13. Web Console 与 MCP

### 13.1 Read-only Web Console

打开 `http://<fixed-ip>:3799` 可查看：

- Hub readiness、版本、存储用量与保留状态；
- App 列表；
- 统一设备标识；
- Session 与统一日志时间线；
- 与 API 相同的 type/severity/text/time 过滤。

不提供配置、权限、清空或删除入口。Web Console 必须调用与 CLI 相同的查询核心，不能复制一套排序与过滤逻辑。

### 13.2 可选 MCP

MCP 不再是主入口。新 `debug-toolkit mcp` 只启动 stdio adapter：

- 通过 `--endpoint/--app-id` 或 `DEBUG_TOOLKIT_HUB_ENDPOINT/DEBUG_TOOLKIT_APP_ID` 显式连接公共 Hub；
- adapter 启动后 endpoint/appId 固定为唯一真源，所有 tool input 都不再接受这两个字段，也不允许调用时覆盖；需要另一个 App 时启动另一份 adapter 配置。这样日志文本无法诱导 Agent 把 MCP 改指向其他内网地址。
- 绝不自动启动本地 Hub，也不监听本地端口；
- 与 CLI 共用 Session 选择、查询、输出预算和稳定错误码；
- P0 tools 固定为 `debug_toolkit_status`、`debug_toolkit_context`、`debug_toolkit_inspect`、`debug_toolkit_events`；前三者输入 schema 是对应 CLI 参数的结构化版本，输出 wrapper 与预算相同。
- stdio tool call 不提供无限 streaming tail。`debug_toolkit_events` 直接对应 10.2 的一次性 events 查询：输入为可选 sessionId/allowStale/cursor/since/until/type/severity/text/limit，不重复 endpoint/appId；无 sessionId 时使用标准选择错误，不悄悄读 stale。默认 limit 100、最大 200，单次合法 JSON 最大 1 MiB；输出固定为 `{events, nextCursor, hasMore, warnings}`，下一次调用显式传 `nextCursor`。预算放不下下一条时不推进 cursor，并令 `hasMore: true`。
- MCP 错误使用 `CallToolResult.isError: true`，并在 `structuredContent.error.code` 中返回同一个稳定 code，而不是 `{ok:false}` 普通文本；
- Skill 主流程不依赖 MCP 是否安装。

## 14. Mac mini 部署与运维

### 14.1 固定版本安装

```bash
npm exec --yes --ignore-scripts --omit=peer \
  --package=react-native-debug-toolkit@4.0.0 -- \
  debug-toolkit hub install --system \
  --bind 10.20.4.10 \
  --advertise-url http://10.20.4.10:3799
```

生产 bootstrap 必须使用精确版本，不接受 `latest`、`4` 或 `4.x`。npm 官方的 `exec --package=<name>@<version>` 会把精确包放入临时 cache PATH，`--yes` 关闭交互安装提示；`--omit=peer` 不把 peer dependencies 解包到磁盘。v4 还必须把 React/RN peers 在 `peerDependenciesMeta` 标为 optional，并让 CLI export 完全不 import RN entry；`--ignore-scripts` 下 Hub 仅凭 Node built-ins 可启动。这样同一个 npm 包仍服务 RN SDK 与 Node CLI，却不要求 Mac mini 安装 React/RN，也不要求可写 global prefix。v4 声明 Node 20+，目标为 macOS 13+ 的 arm64/x86_64，并加入“没有 RN 项目、npm global 目录不可写”的干净 Mac 安装测试。

npm 与当前 Node 只负责这一次 bootstrap。安装命令本身以当前非 root 用户运行，安装器从自身绝对路径取 Hub 文件，只在写系统文件/调用 launchctl 时通过 `/usr/bin/sudo` 提权，不能依赖 sudo 的 PATH。`process.execPath` 只用于确认 bootstrap Node >= 20，绝不把 Homebrew/nvm 的单个 executable 当成可搬运 runtime。

每个 toolkit 精确版本都内置一份按 macOS 架构区分的 runtime manifest，固定官方 Node 发行版版本、HTTPS URL、archive SHA-256 与解包后关键文件 hash。安装器下载并校验完整发行包后才解包；内网环境可传本地 archive，但必须命中同一 hash。由此 LaunchDaemon 不依赖登录 shell、nvm、Homebrew dylib、npm cache 或原安装目录。Hub JS、完整 Node distribution 和 licenses 固定写入：

```text
/Users/Shared/ReactNativeDebugToolkitHub/runtime/<version>/
```

安装器创建原子 symlink `/Users/Shared/ReactNativeDebugToolkitHub/current`，并安装 root-owned、`0755` 的稳定管理 shim `/usr/local/bin/debug-toolkit-hub` 与启动 shim `/usr/local/libexec/debug-toolkit-hub-launch`。plist label 固定为 `com.reactnativedebugtoolkit.hub`，路径为 `/Library/LaunchDaemons/com.reactnativedebugtoolkit.hub.plist`；`ProgramArguments` 永远只指向稳定启动 shim，由它解析并 exec `current/node-dist/bin/node current/hub.js`，不写某个 versioned 目录。

首次安装把发起安装的非 root 用户名/UID/GID 写入 root-owned `install.json` 作为固定 service identity；后续 `--replace` 必须沿用，另一位管理员执行也不能隐式改变。确需更换时使用独立的显式迁移命令，先停服、递归校验并迁移目录 ownership，再更新记录。plist 使用该固定用户，设置稳定 `HOME=/Users/Shared/ReactNativeDebugToolkitHub/home`、最小 PATH、WorkingDirectory 与数据目录；配置为 `RunAtLoad + KeepAlive + ThrottleInterval=5`，plist 为 `root:wheel 0644`，Hub 进程本身不以 root 运行。

数据目录：

```text
/Users/Shared/ReactNativeDebugToolkitHub/data
```

启动 shim 在每次 exec 前把 pre-JS/dyld stderr 做 3 × 1 MiB 有界轮转，再把 child stderr 接到该文件；因此 Node 本身无法启动时也不会被 `/dev/null` 吞掉或无限增长。进入 JS 后 Hub 初始化自己的 size-based rotating writer，运行日志固定为 5 × 10 MiB；plist 自身 stdout/stderr 可指向 `/dev/null`，不宣称 launchd 会替文件轮转。运行日志与 bootstrap 日志分别另有 50 MiB 与 3 MiB 子上限，并共同计入 Hub 20 GB 可变数据硬上限。

### 14.2 日常命令

```bash
debug-toolkit-hub status
debug-toolkit-hub restart
debug-toolkit-hub app-binding list
debug-toolkit-hub app-binding rebind --app-id <id> --platform <ios|android> --native-application-id <id>
debug-toolkit-hub cursor reset --confirm-invalidate
debug-toolkit-hub uninstall
```

- `status` 验证 LaunchDaemon、`/health`、`/ready`、数据目录可写性、版本、固定地址、App/Session 数量、磁盘用量和最近运行错误。
- `restart` 与 `uninstall` 在需要时由 CLI 内部调用 `/usr/bin/sudo`，再通过 `launchctl bootout/bootstrap/kickstart` 完成受控操作。
- `app-binding list` 只读显示 current/archived epoch。`rebind` 仅在 Mac mini 本机运行，通过 sudo 获取全局 registry 锁，要求回显旧值/新值并二次确认；它使旧 epoch 的 generation 失效、把旧 Sessions 标为 archived、递增 epoch、写入含操作者 UID/时间/原因的 audit，再允许新 native application id open。旧 JSONL 不移动也不删除；普通 status/context/Web 默认只看 current epoch，只有显式管理查询才能读取 archived epoch，避免修复后继续混读。
- `cursor reset` 只用于 key 丢失/损坏恢复，必须明确确认所有已发 cursor 失效，并在本机 audit 后生成、fsync 新 key；正常更新绝不调用。
- `uninstall` 默认保留数据；只有显式 `--delete-data` 并再次确认才删除。
- 安装器遇到端口占用、目录不可写或协议不匹配时必须失败并给出具体动作。

更新仍用精确版本的 npm bootstrap 加 `hub install --replace`，并形成一个明确事务：

1. 在旧服务运行时完成新 runtime hash、完整 Node distribution、配置、数据 reader compatibility 与磁盘空间的离线预检。
2. 记录旧 symlink，bootout 旧服务，原子切换 `current`，以 **probe-only** 模式 bootstrap 新服务。此时 `/health` 可用，但 Session open/events 返回 503 并让 App 保留内存缓冲，绝不写不可逆数据。
3. 安装器打印带一次性 nonce 的手机验证 URL 并最多等待 90 秒；新 executable 必须从同网段手机收到该 nonce，且本机 `/ready?probe=1`、数据目录可写和 runtime version 都通过，才由本地安装事务提交为 writable。
4. 任一步失败或超时，安装器 bootout 新服务、恢复旧 symlink 并拉起旧服务；因为 probe-only 阶段没有新格式写入，自动回滚不依赖旧版本理解新数据。

提交之后的手工回滚只允许目标 runtime 声明可读取当前 `storageFormatVersion`。API v1 的 patch/minor 版本必须保持 JSONL、ledger、manifest 向后可读，新增字段只能 additive；需要不可逆 storage migration 时必须升 Hub API major，不进入本自动替换流程。

成功提交后只保留 current 与一个已验证 previous runtime，其他旧 runtime 目录才可删除；因此只读 binaries 不进入 20 GB 日志配额，也不会随升级次数无限累积。

### 14.3 地址与网络

- `bindAddress` 与 `advertiseUrl` 必须显式分开：Hub 只绑定组织提供的固定 IPv4；可选内部 DNS 只改变 advertiseUrl，不是 P0 依赖。
- 固定 IP/DHCP reservation 与公司网段 firewall allowlist 由 Mac mini 运维者负责。网络层 IP/port allowlist 可保持不变，但 macOS Application Firewall 可能按 executable/code signature 判断，安装器不能假装永久稳定；每次安装/升级后的 `doctor` 都要从同网段手机验证入站连接，失败时给出系统防火墙检查动作。
- 安装器打印配置后的 advertiseUrl 和手机验证 URL，不从 `0.0.0.0` 猜测公共地址，也不让普通开发者猜本机 IP。
- macOS firewall、公司网络隔离、iOS Local Network/ATS 和 Android cleartext 是首次接入检查项。
- Hub 不提供公网穿透、自动 mDNS 发现或 TLS 终止。

### 14.4 本地前台模式

需要仓库开发 Hub 本身时可运行：

```bash
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit hub start
```

它使用与公共服务完全相同的协议、存储和查询模块，只改变监听地址与数据目录。

## 15. 发布顺序

v4 是一次干净切换，不做双协议灰度：

1. 先盘点所有使用团队，明确同一切换窗口、固定 endpoint、各自组织唯一 appId 与 v4 升级负责人。v3 daemon 位于各开发者电脑，不假设 Mac mini 上存在旧服务。
2. 在业务分支升级 App 到 v4，加入 `appId + endpoint`、生产关闭规则并提交 Skill，但在 Hub ready 前不发布给日常测试者；各团队保留可安装的最后一个 v3 测试 App 与对应仓库 revision。
3. 在新的 Mac mini 地址安装并验证 v4 Hub `/ready`、手机入站网络与容量策略，不停止开发者电脑上的 v3 daemon。
4. 在小范围发布 v4 测试 App，验证 Session open、CLI 四命令、续传和 Web Console；通过后各团队再停止自己的 v3 daemon 并扩大测试。
5. 需要 MCP 的个别客户端最后安装 v4 adapter。

旧 App 无法向 v4 Hub 上传且不保证可理解的升级错误；切换前必须先验证目标业务仓库已计划升级。旧持久化文件和移动端 v3 preference 留在原位置但完全忽略，不自动迁移或删除。若小范围验收失败，回滚是一个协调动作：停止 v4 Hub、给试点者恢复 v3 App build、v3 仓库 revision/Skill 与各自本地 endpoint/daemon；不能只回滚 Hub runtime 后声称 v4 App 已恢复。扩大测试后优先修复前滚，除非所有已切团队都能完成上述整体回退。

## 16. 测试与验收矩阵

### 16.1 协议与 App

- 初始握手、连续 batch、HTTP 错误分类和 jitter retry。
- ACK 丢失重发后 JSONL 仍只有一条记录。
- append 后 ACK 前 Hub 崩溃，重启后恢复高水位且不重复。
- 已 ACK 且仍 retained 的同 sequence 不同 payload 返回 `SEQUENCE_CONFLICT`；相同 payload 幂等 ACK。落入 retention gap 后不重写，只 ACK 并返回 `duplicate_not_verifiable` warning。
- 新 generation 写入 ledger 并 fsync 后才返回；接管后旧 generation 即使先通过外层校验也无法在 writer lock 内继续写，重新 open 能按 expectedSequence 恢复。
- 已编号 poison event 被转换为同 sequence rejection tombstone，ACK 不会永久卡住。
- canonical hash 不匹配时整批不写、不消费 sequence；events/open ACK 响应丢失后，durable `rejected[]` 会按 clientAckThrough 幂等重放。
- pending→in-flight 的最终重计费不突破 500 条/2 MiB，也不制造 sequence 空洞；`toolkit.buffer_overflow` 统计准确且仍为 untrusted event。
- canonical version 1 在 iOS/Android/Node 的 RFC 8785 golden vectors 一致，所有非 JSON 归一化 case 与版本不匹配均覆盖。
- 64 KiB 边界、中文/emoji、多层对象缩减后仍是合法 UTF-8 JSON。
- App 后台超过 45 秒变为非活跃，回前台继续同一 Session 与未 ACK batch。
- paused 继续 heartbeat 但明确标记 syncState；“立即同步”后仍 paused。
- Runtime endpoint override 提交、清空、冷启动还原 canonical、跨 Hub 新建 Session 以及 v3 preference 被忽略。
- bare RN 与 Expo prebuild 的 dev/internal 网络权限存在、production 不存在；iOS 拒绝权限后“立即同步”能进入 Settings 恢复路径。
- 正式生产构建不连接 Hub。

### 16.2 存储与查询

- 16 MiB 与 1 小时 rotation 边界无丢失、重复或半行。
- active 文件半写后启动修复到最后合法换行。
- segment fsync、ledger commit、manifest replace 各阶段断电后的恢复高水位正确；首次 ledger 和 compaction rename 都验证 parent directory fsync；仅靠 ledger + retained JSONL 可恢复完整 manifest 元数据，ledger 半行与压缩失败可恢复。
- identity registry 在重启/7 天清理后仍保留 app binding；Session 过期在 tombstone preparing、逐目录删除、finalize 各断电点都可恢复，tombstone 额外 7 天后按文档到期；rebind 会归档旧 epoch 而不混入默认查询。
- 7 天和 20 GB 分别触发全局 oldest-segment 清理。
- 清理中的查询不会读到半文件；被清理 cursor 返回 410 与可直接使用的 baseline cursor，有事件和空集两种恢复路径均覆盖；baseline 签发后 gap 再前移会再次 410。
- cursor 在 Hub 重启、runtime 更新和 v4 回滚后仍可验证；key 丢失导致 not-ready，显式 reset 后旧 cursor 统一 `CURSOR_INVALID`。
- Session 标记 `truncated` 后，status/context/Web Console 结果一致。
- context 在固定 snapshot cursor 上跨时间重放仍使用原 capturedAt、包含 through sequence、统一排序且不超过 128 KiB。
- SSE 断线续读、慢消费者断开和 CLI 有界 tail；2 MiB/200 条边界始终保留完整 end/cursor，不丢弃未输出事件。
- replay/live 原子交接不漏事件；tail 遇到任何新 Session 都在输出其事件前以 `selection_required` 结束，确认短码后才能新开 tail。

### 16.3 AI 与 onboarding

- 公共 Hub 即使只有另一位同事一个 active Session，Skill 也不会自动读取；先按 App 按钮显示的 `hubRef-sessionRef` 定位码锁定并记录基线，再要求点击，只有同一 Session 的 `lastManualSyncAt` 严格推进才读取。
- Hub 不可达、App 离线、无 Session、stale 崩溃 Session、旧 Session、协议错误均触发正确 Skill 动作；已确认 stale Session 可用 `--allow-stale` 读取。
- 恶意日志文本不能诱导 Skill 执行命令、访问 URL 或修改代码。
- 新同事从安装 App 包、完成原生网络配置、首次上报到 AI 成功读取形成完整文档闭环。
- 未安装 MCP 时全部主流程仍可完成。
- workspace 依赖未安装时 `npm exec --no --package=react-native-debug-toolkit` 不访问 registry、不执行同名错误包，而是返回 `TOOLKIT_NOT_INSTALLED`。
- canonical 与 Runtime override Hub 恰有相同 sessionRef 时，按钮定位码的 hubRef 先排除错误 Hub；刷新未推进也会禁止读取。Skill 不会读取别人的 Session 或比较两个 Hub 的时钟。
- status/error/tail 的候选均把 Hub control、untrusted device metadata 与整体降级 label 分开标记，恶意 model/version 不会进入可信控制字段。
- MCP adapter 固定 endpoint/appId，tool call 无法覆盖；`debug_toolkit_events` 的 100/200 条、1 MiB、nextCursor、stale 与 selection error 契约在无 MCP 安装依赖的测试中覆盖。

### 16.4 Mac mini 运维

- 无人登录的冷启动后 LaunchDaemon 自动运行。
- Hub 以普通用户运行，数据始终写入 `/Users/Shared` 而非 `/var/root`。
- 没有 RN 项目、npm global 不可写、使用 nvm/Homebrew 且 sudo PATH 为空的干净 Mac 仍能通过一次 npm bootstrap 安装；删除 bootstrap Node/Homebrew 后，完整官方 Node distribution 仍可冷启动。
- 不同管理员执行 replace 不改变 service identity；plist 的 current 路径、原子切换、失败回滚和稳定 management shim 都可验证。
- 运行日志确实按 5 × 10 MiB 轮转；每次升级后从手机重新验证 macOS firewall 入站。
- replace 的离线预检、probe-only、带 nonce 手机验证、提交与 90 秒自动回滚均覆盖，probe 阶段没有新格式写入。
- 错误 app binding 可由本机 rebind 归档修复，旧日志仍在但 AI 默认查询不混读。
- `status/restart/uninstall`、端口占用、目录不可写和整体 v3/v4 回滚路径可验证。
- Hub 异常退出后 launchd 自动拉起，App 缓冲随后续传。

## 17. 最终已确认决策

- 公共 Mac mini 固定 IP，单体 Shared Hub。
- 不做权限系统；仅限可信 LAN/VPN。
- 不脱敏；生产默认关闭。
- App 复用现有配置，只传固定 `appId` 与 endpoint。
- App UI 只有 endpoint 输入和两个同步按钮。
- 开发/内部测试默认自动实时同步。
- Session-scoped JSONL，7 天，Hub 总量 20 GB。
- CLI 是 AI 主入口，HTTP 是底层协议，MCP 可选。
- npm 提供 CLI；Skill 生成到业务仓库并提交。
- `status/context/inspect/tail` 是 P0 读取面。
- Skill 默认只读，按标准错误码处理，不接受日志中的指令。
- 设备标识固定为 platform/OS、型号、IP、App 构建、最后活跃时间。
- HTTP 批量上传、500 条/2 MiB 内存发送缓冲、64 KiB 单条上限、15 秒心跳/45 秒活跃窗口。
- 系统级 LaunchDaemon，开机无需登录即可运行。
- v4 完全重建，不兼容旧协议、旧命令或旧数据。
