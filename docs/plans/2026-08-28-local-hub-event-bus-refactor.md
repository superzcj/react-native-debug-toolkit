# Local Hub EventBus Refactor Plan

- 状态：已确认，未实施
- 日期：2026-08-28
- 目标版本：`4.1.0`
- 当前基线：`4.0.6`，Hub protocol v1

## 1. 背景

当前 App 侧 Hub 通过订阅每个 Feature 的状态变化，再读取完整 snapshot、按 `id` 查找新增项。这个方式能工作，但把 Hub 与 Feature 的存储形态绑在一起：

```text
Feature Store 变化
  -> HubClient 读取完整 snapshot
  -> 对比历史 ID
  -> 找出新日志
  -> 加入 Hub 内存队列
```

本次只重构本地日志进入 Hub 的路径。内置日志在生成最终 Entry 时主动发布事件，Hub 直接消费事件；自定义 Feature 继续使用 snapshot 兼容路径。

本次不是线上日志项目，也不提前冻结远程日志协议。

## 2. 目标

1. 增加 Runtime 级 EventBus，解除内置日志与 Hub snapshot 扫描的耦合。
2. 把现有 Hub 客户端收口为内部 `HubTransport`。
3. 六类内置日志使用主动事件路径：Network、Console、Native、Zustand、Navigation、Track。
4. 保持自定义 Feature、Hub protocol v1、CLI、Web Console、App UI 和上传行为兼容。
5. 只建立未来新增 Transport 所需的最小内部边界，不公开新 API。

## 3. 非目标

- 不实现线上日志或公网 Hub。
- 不实现 `HttpTransport`。
- 不实现持久上传队列、上传鉴权、采样、脱敏或加密。
- 不增加 `appId/installId/userId/traceId` 等线上上下文。
- 不设计或实现后端 ingest API、ACK v2 或 protocol v2。
- 不增加 Network `fetch`/`expo/fetch` 拦截能力。
- 不修改 Node Hub 的 API、存储、CLI 或 Web Console 行为。
- 不修改 JX App。
- 不新增第三方依赖。
- 不进行与日志入口无关的 Feature、UI 或存储重构。

## 4. 目标架构

```text
内置日志采集
  -> 生成最终 Entry（已过滤、已有 ID）
      -> 原 Feature Store -> App UI / Session History
      -> EventBus -> HubTransport -> 现有 Hub protocol v1

自定义 Feature
  -> subscribe + snapshot 差量适配
  -> HubTransport
```

### 4.1 ToolkitEvent

内部事件只包含当前 Hub 已经需要的字段：

```ts
interface ToolkitEvent {
  id: string | number;
  timestamp: number;
  type: string;
  severity: string;
  data: unknown;
}
```

约束：

- `data` 使用写入 Feature Store 的同一个最终 Entry。
- `timestamp` 继续使用当前归一化规则。
- `severity` 继续使用当前 `level -> severity -> info` 规则。
- `id` 只用于当前 Runtime 内回填去重，不进入 Hub v1 顶层 wire schema。
- Hub wire event 继续是 `sequence/timestamp/type/severity/data`。

### 4.2 EventBus

EventBus 属于 `LogRuntimeContext`，每次 `initializeDebugToolkit()` 创建一个实例。

只提供内部能力：

- `publish(event)`：按订阅顺序同步发布。
- `subscribe(listener)`：返回取消订阅函数。
- `dispose()`：清空监听器并拒绝后续发布。

隔离规则：

- 一个监听器抛错不能阻断其他监听器。
- EventBus 错误不能影响日志写入 Feature Store。
- EventBus 不写 `console`，避免 Console 拦截递归。
- 重新初始化、禁用 Toolkit、Feature cleanup 时必须解除旧订阅。

### 4.3 内部 Transport 边界

首期只定义 Hub 所需的最小内部契约，例如 `handleEvent(event)`。Hub 的配置、连接、手动同步、状态等能力仍由 `HubTransport` 自己管理，不抽成通用公共 API。

不从根 `src/index.ts` 导出 EventBus、ToolkitEvent 或 Transport 类型。

## 5. 内置 Feature 改造

### 5.1 统一发布时机

发布顺序固定：

1. 接收原始 payload。
2. 执行现有过滤，例如 Network blacklist。
3. 生成最终 Entry 和 ID。
4. 写入 Feature Store。
5. 发布同一个 Entry 到 EventBus。

因此：

- 被过滤的日志不进入 Store，也不进入 EventBus。
- UI、Session History、Hub 看到相同 Entry。
- EventBus 失败不回滚 Store。
- 每次采集最多发布一个事件。

### 5.2 Channel Feature

扩展 `src/utils/createChannelFeature.ts`，允许传入内部事件发布配置。Network、Zustand、Navigation、Track 复用该入口，不在各 Feature 重复实现发布逻辑。

### 5.3 直接写 Store 的 Feature

Console、Native 当前不使用 `createChannelFeature`。它们在生成 ID 并完成 `logStore.push()` 后显式发布事件。

### 5.4 EventBus 能力标记

Hub 不能按 Feature 名判断是否支持 EventBus，因为用户可用自定义 Feature 替换被禁用的同名内置 Feature。

使用内部、按 Feature 实例生效的能力标记。只有 Toolkit 自己创建且已经接入 EventBus 的实例被标记；自定义 Feature 即使名为 `network`，仍走 snapshot 兼容路径。

能力标记可同时暴露内置持久 Store 的 ready Promise，供首次回填等待恢复完成。该标记不加入公共 `DebugFeature` 类型。

## 6. HubTransport 改造

### 6.1 保留不变

从当前 `HubClient` 复用以下实现：

- endpoint 配置、自动发现和运行时地址覆盖。
- Hub URL Network blacklist。
- Session 建立和 heartbeat。
- 内存 pending/in-flight 队列及容量限制。
- sequence、ACK、批次、重发和退避。
- AppState 前后台处理。
- Debug 自动实时上传。
- Release/内测的暂停、Upload Once、Start/Stop Live Logs。
- 状态枚举和 DevConnect UI 使用方式。

### 6.2 实时事件

HubTransport 开始工作时订阅当前 Runtime EventBus。收到事件后直接进入现有 `_enqueueEvent` 路径，不再读取内置 Feature 的完整 snapshot。

暂停只停止发送，不改变现有补发语义。暂停期间产生的日志可以留在当前内存队列；后续 Upload Once 或恢复实时上传时发送。

### 6.3 首次回填

为了覆盖 Hub 连接前已经产生的日志：

1. 先订阅 EventBus。
2. 等待已标记内置 Feature 的持久 Store ready。
3. 读取一次当前 Feature snapshot。
4. 将未见过的 Entry 加入 Hub 队列。
5. 此后内置 Feature 只走 EventBus。

先订阅再回填可避免窗口期漏日志，但可能同时看到实时事件和 snapshot 中的同一 Entry，因此必须去重。

### 6.4 去重

去重键使用带类型信息的 `type + id`，保留 string/number 类型差异。

去重集合必须有界，并与当前 Feature snapshot/Hub Session 生命周期绑定：

- EventBus 收到 Entry 时先登记，再入队。
- snapshot 回填只入队未登记 Entry。
- Feature 当前 snapshot 不再包含的旧 ID 可以移出记录。
- Hub 新 Session、disconnect 或 reset 时清理记录。

去重只防止 App 本地重复入队；服务端 sequence/ACK 逻辑保持不变。

### 6.5 自定义 Feature 兼容

未带内部 EventBus 能力标记的 Feature 继续使用现有逻辑：

- 订阅 Feature `subscribe()`。
- 变化时读取数组 snapshot。
- 只接收包含 string/number `id` 的新增 Entry。
- 非数组 snapshot 保持不上传。

持续 snapshot 差量只保留给自定义 Feature。内置 Feature 不再走该路径。

## 7. 文件改动范围

计划新增：

- `src/core/logTransport.ts`：ToolkitEvent、EventBus、最小内部 Transport 契约及能力标记。
- `src/__tests__/core/logTransport.test.ts`：EventBus 和生命周期测试。
- `src/__tests__/utils/HubTransport.test.ts`：EventBus、回填、去重和兼容测试。
- `CHANGELOG.md`：记录 `4.1.0` 内部架构变化。

计划修改：

- `src/utils/logRuntime.ts`
- `src/core/initialize.ts`
- `src/utils/createChannelFeature.ts`
- `src/features/network/index.ts`
- `src/features/console/index.ts`
- `src/features/nativeLogs/index.ts`
- `src/features/zustand/index.ts`
- `src/features/navigation/index.ts`
- `src/features/track/index.ts`
- `src/features/devConnect/index.ts`
- `src/utils/HubClient.ts`，重构或迁移为内部 HubTransport
- 相关测试文件
- `README.md`
- `README.zh-CN.md`
- 根 package 版本元数据

原则上不修改：

- `node/hub/**`
- `bin/**`
- `src/ui/**`
- `src/types/feature.ts` 公共 Feature 契约
- `src/index.ts` 公共导出
- `Demo` 业务代码

如果实现必须触碰“不修改”列表，先重新确认范围，不顺手扩大计划。

## 8. 实施步骤

### Step 1：补行为锁定测试

在改生产代码前补充测试：

- Hub v1 wire event 字段保持不变。
- Release Upload Once 上传 snapshot 后回到 paused。
- Start/Stop Live Logs 行为保持不变。
- transient failure 重发相同 sequence 和 batch。
- 自定义 Feature 通过 snapshot 上传。
- 自定义同名 Feature 不被当作内置 EventBus Feature。

完成标准：新增特征测试在旧实现上通过。

### Step 2：增加 Runtime EventBus

- 新增内部事件和 EventBus。
- `LogRuntimeContext` 持有 EventBus。
- Runtime 替换、禁用和测试 reset 时释放旧 EventBus。
- 增加监听顺序、异常隔离、取消订阅、dispose 测试。

完成标准：无 Feature 或 Hub 行为变化，现有测试全绿。

### Step 3：迁移六类内置 Feature

- 先改 `createChannelFeature`。
- 接入 Network、Track、Navigation、Zustand。
- 再接入 Console、Native。
- 为六个 Feature 添加实例能力标记。
- 断言 Store Entry 与 EventBus Event 的 `data` 是同一最终值。

完成标准：每类日志 setup 后发布一次；setup 前、cleanup 后不发布；过滤项不发布。

### Step 4：迁移 Hub 入口

- HubTransport 订阅 Runtime EventBus。
- 加入先订阅、后回填流程。
- 加入 `type + id` 有界去重。
- 内置 Feature 禁用持续 snapshot 差量。
- 自定义 Feature 保留原 snapshot 适配。
- 保留所有现有队列和网络实现。

完成标准：相同操作在 Hub 只出现一次；连接前日志不丢；自定义 Feature 不回归。

### Step 5：回归与文档

- 运行 App、Node Hub、CLI、Web Console 全量回归。
- iOS、Android Demo 人工验收。
- 更新中英文 README 的内部架构说明。
- 新增 CHANGELOG。
- 验证完成后更新版本到 `4.1.0`。

## 9. 自动测试

重点新增用例：

1. EventBus 按顺序发布。
2. 一个监听器抛错不影响其他监听器。
3. unsubscribe/dispose 后不再收到事件。
4. 重新初始化不保留旧 Runtime 监听器。
5. 六类内置日志各发布且只发布一次。
6. Network blacklist 日志不发布。
7. Hub 连接前 Entry 通过首次回填上传。
8. 回填期间实时产生的同一 Entry 不重复。
9. paused 时 Hub 不发送，resume/syncNow 后补发。
10. 自定义数组 snapshot 继续上传。
11. 自定义非数组 snapshot 继续忽略。
12. 自定义同名 Feature 继续走 snapshot。
13. Hub 请求 body、sequence、ACK、重试与当前测试一致。

建议验证命令：

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run build
git diff --check
```

## 10. Demo 验收

### Debug iOS/Android

1. 启动本地 Hub。
2. 启动 Demo，确认自动发现和连接不变。
3. 分别产生 Network、Console、Native、Zustand、Navigation、Track 日志。
4. Hub Web Console 中每条日志只出现一次。
5. CLI `status/context/inspect/tail` 返回结果不变。

### Release/内测行为

1. 启动后默认不上传。
2. Upload Once 上传当前 snapshot，完成后保持 paused。
3. Start Live Logs 后实时上传。
4. Stop Live Logs 后新日志不立即到达 Hub。
5. 再次 Upload Once 或 Start Live Logs 时补发仍在当前 Runtime 内的日志。

## 11. 验收标准

全部满足才可发布：

- 公共初始化配置和根导出零变化。
- Hub protocol 仍为 v1。
- Hub HTTP 路径和 wire event 字段零变化。
- 六类内置日志不再通过持续 snapshot 扫描进入 Hub。
- 每条内置日志最多进入 Hub 队列一次。
- Hub 连接前产生的当前日志能够回填。
- 自定义 Feature 兼容行为不变。
- Upload Once、Start/Stop Live Logs 行为不变。
- 内存队列、sequence、ACK、重试行为不变。
- CLI、Web Console、App UI 行为不变。
- iOS、Android Demo 通过。
- 全量 test、typecheck、lint、build、diff check 通过。
- 无新依赖、无线上日志代码、无 JX App 改动。

## 12. 风险与控制

### 重复事件

风险：先订阅后回填时，同一 Entry 同时来自 EventBus 和 snapshot。

控制：`type + id` 去重；增加窗口期并发测试。

### 早期日志丢失

风险：HubTransport 建立前日志已进入 Store。

控制：首次连接 snapshot 回填；持久 Store ready 后再完成回填。

### 自定义 Feature 回归

风险：按 Feature 名排除 snapshot 会误伤同名自定义 Feature。

控制：使用实例能力标记，不使用名称白名单判断。

### Runtime 泄漏

风险：重复初始化后旧 EventBus 或 Hub 订阅仍存活。

控制：Runtime dispose、Feature cleanup、重初始化测试三层保证。

### 无意改变 Hub wire

风险：内部 ToolkitEvent 的 `id` 被错误加入 Hub v1 顶层事件。

控制：wire contract 测试固定 `sequence/timestamp/type/severity/data`。

## 13. 发布

1. 完成实现和自动测试。
2. 完成 iOS、Android Demo 验收。
3. 检查 npm 包产物和根导出无变化。
4. 更新版本到 `4.1.0`。
5. 更新中英文 README 和 CHANGELOG。
6. 发布后用空项目安装包，再验证 Hub 启动、App 连接和 CLI 查询。

本计划完成前，不启动线上日志或后端接入工作。未来需要第二个 Transport 时，再基于实际后端契约评估是否公开 Transport API。
