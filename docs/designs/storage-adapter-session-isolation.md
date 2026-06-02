# StorageAdapter + Session 日志隔离

## 问题

1. **日志跨启动混在一起** — console/network/track 用全局 key 存，app 每次重启的日志全混一块，分不清哪条是哪次的
2. **没法用 MMKV** — 只能走 AsyncStorage 或内存，无法利用 MMKV 的同步读写优势
3. **没有 session 轮转** — 有单类日志条数上限，但没有 session 级别的数量控制和旧 session 清理
4. **cleanup 误删历史** — feature cleanup / `reset()` / `replaceFeatures()` 会清空持久化日志，历史全丢
5. **session 不统一** — DaemonClient 有自己的 streaming session，日志存储各管各的

## 目标

- 每次 app 启动 = 一个 runtime session
- console/network/track 按 session 隔离存储
- 运行时只恢复当前 session，历史 session 懒加载
- 超过保留数量后自动删旧 session
- feature cleanup 只释放订阅和 timer，不删磁盘日志
- Mac sync 默认只发当前 session

## 方案概述

两个核心抽象：

**StorageAdapter** — 统一存储接口，自动选最快的引擎：
```
MMKV（同步，最快）→ AsyncStorage → 纯内存
```
只管日志和 session 数据。全局偏好（DevConnect 配置等）继续走原有 AsyncStorage 链，不受影响。

**SessionManager** — 管理 session 生命周期：
- app 启动时同步生成新 session
- 日志按 `@react_native_debug_toolkit/{sessionId}/console_logs` 这样的 key 存储
- 保留最近 3 个 session，超了自动删旧的
- DaemonClient 复用同一个 session

## 边界（不做什么）

- 不迁移旧全局日志 key（`@react_native_debug_toolkit/console_logs` 等），直接废弃
- MMKV 自动优先只作用于日志/session 存储，全局偏好不走 MMKV
- `KEYS` 不再暴露日志 key，只保留全局配置 key
- 用户手动 Clear 只清当前 session 的该 feature 日志
- 历史 session 不自动同步到 Mac，后续通过显式选择/export 才发送

## 变更文件

| 文件 | 操作 |
|------|------|
| `src/utils/StorageAdapter.ts` | **新建** — 日志/session 存储接口 + 三种实现 + 工厂 |
| `src/utils/SessionManager.ts` | **新建** — session 生成、index、日志 key、历史读取、清理 |
| `src/utils/debugPreferences.ts` | **修改** — 移除日志 key，只留全局配置，补 `removePreference()` |
| `src/utils/createPersistedObservableStore.ts` | **修改** — 接收 storage adapter，拆分 `dispose()` 和 `clearPersisted()` |
| `src/utils/createChannelFeature.ts` | **修改** — persist config 传 storage，cleanup 调 `dispose()` |
| `src/features/console/index.ts` | **修改** — 使用 session 日志 key，cleanup 不清历史 |
| `src/features/network/index.ts` | **修改** — 使用 session 日志 key，持久化前截断 body/data |
| `src/features/track/index.ts` | **修改** — 使用 session 日志 key |
| `src/utils/DaemonClient.ts` | **修改** — report/streaming 使用 runtime session provider |
| `src/core/initialize.ts` | **修改** — 创建 storage/session，再创建 feature |
| `src/index.ts` | **修改** — 只导出稳定类型和注入入口 |
| `src/types/index.ts` | **修改** — 导出稳定存储/session 类型 |
| `package.json` | **修改** — 添加 optional peerDependencies |

## 实现步骤

### Step 1: StorageAdapter — 统一存储接口

`src/utils/StorageAdapter.ts`

```typescript
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

三种内置实现：
- `MemoryStorageAdapter`：`Map<string, string>`，同步，零依赖
- `AsyncStorageAdapter`：包装 `@react-native-async-storage/async-storage`
- `MMKVStorageAdapter`：包装 `react-native-mmkv`，`new MMKV({ id: 'debug-toolkit-logs' })`

工厂函数自动选最快的：

```typescript
export function createDefaultLogStorage(): StorageAdapter {
  // 1. react-native-mmkv
  // 2. @react-native-async-storage/async-storage
  // 3. MemoryStorageAdapter
}
```

实现要求：
- `removeItem` 必须存在，旧 session 清理依赖它
- dynamic `require` 包在 try/catch 内，缺依赖不报错
- AsyncStorage 兼容 `default` export 和 named export
- MMKV 失败不能影响 toolkit 初始化，直接 fallback
- 不负责全局偏好，避免装 MMKV 后丢 DevConnect 旧配置

### Step 2: SessionManager — session 生命周期管理

`src/utils/SessionManager.ts`

```typescript
export type LogFeatureKey = 'console_logs' | 'network_logs' | 'track_logs';

export interface LogSession {
  id: string;
  startedAt: number;
}

export interface SessionIndex {
  currentSessionId: string;
  sessions: LogSession[];
  maxSessions: number;
}

export interface SessionManagerOptions {
  maxSessions?: number;
  featureKeys?: LogFeatureKey[];
}
```

设计要点：
- constructor **同步**生成 current session，feature 创建时已有 key，不用等异步
- `initialize()` 异步写 session index + 清理旧 session，不阻塞 `initializeDebugToolkit()`
- session id 格式：`${Date.now()}-${randomHex}`
- 默认 `maxSessions = 5`
- malformed index 当空 index 处理，不影响启动

API：

```typescript
class SessionManager {
  constructor(storage: StorageAdapter, options?: SessionManagerOptions);
  initialize(): Promise<void>;
  getCurrentSession(): LogSession;
  getSessionHistory(): Promise<LogSession[]>;
  getLogStorageKey(featureKey: LogFeatureKey, sessionId?: string): string;
  loadSessionLogs<T>(sessionId: string, featureKey: LogFeatureKey): Promise<T[]>;
  clearCurrentSessionLogs(featureKey: LogFeatureKey): Promise<void>;
  cleanupOldSessions(): Promise<number>;
}
```

日志 key 按这个规则拼：

```text
@react_native_debug_toolkit/sessions                    ← session index
@react_native_debug_toolkit/{sessionId}/console_logs    ← 该 session 的 console 日志
@react_native_debug_toolkit/{sessionId}/network_logs    ← 该 session 的 network 日志
@react_native_debug_toolkit/{sessionId}/track_logs      ← 该 session 的 track 日志
```

清理规则：
- index 按 `startedAt` 倒序保存
- 超过 `maxSessions` 后删除旧 session 的已知 feature key
- 只删 session-scoped log key，不碰全局偏好 key

### Step 3: debugPreferences — 全局偏好不动

`src/utils/debugPreferences.ts`

保留：
- `getPreference()` / `setPreference()`
- AsyncStorage → native preferences → memory fallback链

新增：

```typescript
export function removePreference(key: string): Promise<void>;
```

`KEYS` 只保留全局配置 key（`fabPosition`、`lastTab`、`computerHost`、`daemonPort`），删掉 `consoleLogs`、`networkLogs`、`trackLogs`。

不做：不把全局偏好迁到 MMKV，不让日志 session 清理调用 `debugPreferences`。

### Step 4: 拆分 dispose 和 clearPersisted

当前问题：`destroy()` 会写 `[]`，feature cleanup 误删持久化日志。

拆成两个语义明确的操作：

```typescript
export interface PersistedStoreOptions<T> {
  storage: StorageAdapter;
  storageKey: string;
  maxPersist: number;
  debounceMs?: number;
  serialize?: (entry: T) => unknown;
}

export interface PersistedObservableStore<T> extends ObservableStore<T> {
  nextId: () => string;
  ready: Promise<void>;
  clearPersisted: () => void;  // 清内存 + 写 storage = []
  dispose: () => void;          // 清内存，不写 storage
}
```

- **`clearPersisted()`**：清内存 + 取消 pending write + 写 `storageKey = []` → 用户点 Clear 时用
- **`dispose()`**：取消 pending write + 清内存，不写 storage → feature `cleanup()` 时用
- `destroy` 命名移除，避免"清资源+清磁盘"的混合语义

### Step 5: 各 feature 接入 session key

新增内部 runtime context（不放进公开 feature config）：

```typescript
interface LogRuntimeContext {
  sessionManager: SessionManager;
  logStorage: StorageAdapter;
}
```

初始化路径：`initializeDebugToolkit()` 创建 `LogRuntimeContext`，内置 feature factory 通过内部第二参数拿 context。公开 API 不变。

各 feature 接入：
- **console** — `storageKey = sessionManager.getLogStorageKey('console_logs')`，`cleanup()` 只释放 hook + dispose store
- **network** — 同上 + `serialize` 持久化前截断 `request.body` / `response.data`（复用 `deviceReport` 的 sanitize 思路）
- **track** — `storageKey = sessionManager.getLogStorageKey('track_logs')`
- **navigation/zustand** — 当前不持久化，不接入 session

### Step 6: initialize 组装顺序

`src/core/initialize.ts`

```typescript
interface InitializeOptions {
  features?: FeatureConfigs;
  enabled?: boolean;
  logStorage?: StorageAdapter;
  maxLogSessions?: number;
}
```

启动流程：
1. 解析 `enabled`
2. disabled → 清 daemon session provider，`DebugToolkit.reset()`，返回
3. 创建 `logStorage`（用户传入或 `createDefaultLogStorage()`）
4. 创建 `sessionManager`
5. 设置 `daemonClient.setSessionProvider()`
6. 用 runtime context 创建内置 features
7. `DebugToolkit.replaceFeatures()`
8. `sessionManager.initialize().catch(...)`（异步，不阻塞）
9. 恢复 DevConnect + daemon streaming

注意：disabled 不创建 session，不清磁盘日志，但必须清 session provider 防止复用上次的 session。

### Step 7: DaemonClient session 统一

当前 DaemonClient 内部自己生成 streaming session。改为外部注入：

```typescript
type SessionProvider = () => SessionInfo;

daemonClient.setSessionProvider(provider);
daemonClient.clearSessionProvider();
```

- streaming / `reportOnce()` 使用 provider 返回的 runtime session
- 没有 provider 时 fallback 内部 session，保证低层 API 单独使用不崩
- `disconnect()` 只断 stream，不清 provider session
- `_resetForTesting()` 清 provider

### Step 8: 导出策略

公开：
- `StorageAdapter`、`LogSession`、`LogFeatureKey`、`SessionManagerOptions`
- `createDefaultLogStorage`、`MemoryStorageAdapter`

暂不公开：
- `SessionManager`（runtime 内部协调器，过早公开会固定 API）
- `AsyncStorageAdapter`、`MMKVStorageAdapter`（实现细节，用户传 `StorageAdapter` 即可）

`package.json` 加 optional peerDependencies：

```json
"peerDependencies": {
  "@react-native-async-storage/async-storage": ">=1.0.0",
  "react-native-mmkv": ">=2.0.0"
},
"peerDependenciesMeta": {
  "@react-native-async-storage/async-storage": { "optional": true },
  "react-native-mmkv": { "optional": true }
}
```

## Mac sync 行为

| 操作 | 发送什么 |
|------|---------|
| Send Once | 当前 session 的 full report |
| Start Live Sync | 当前 session full report + deltas |
| App 重启后 live sync | 新 session，新 full report |
| 历史 session | 不自动发送，后续通过 export |

## 性能考量

| 关注点 | 方案 |
|--------|------|
| 写入性能 | 保留 2s debounce；MMKV 路径同步写 |
| 启动恢复 | 只读当前 session 的持久化日志 |
| 历史读取 | `loadSessionLogs()` 按 session + feature 懒加载 |
| 内存占用 | runtime store 只持当前 session |
| 磁盘清理 | `cleanupOldSessions()` 删除超限 session 的 feature key |
| 大日志 | network persist 前截断 body/data |
| reset/replaceFeatures | 只释放订阅和 timer，不删磁盘日志 |

## 验证清单

1. `npm run typecheck`
2. `npm test -- --runInBand --watchman=false`
3. `npm run build`
4. `npm pack --dry-run`
5. 单测：StorageAdapter fallback 顺序 MMKV → AsyncStorage → memory
6. 单测：AsyncStorage default/named export 都可用
7. 单测：debugPreferences 仍按原链读取全局偏好
8. 单测：`KEYS` 保留 `daemonPort`，不含 console/network/track log key
9. 单测：SessionManager constructor 同步生成 current session
10. 单测：连续 3 次 session 初始化后 index 倒序保存
11. 单测：第 6 次启动清理第 1 个 session 的 feature key
12. 单测：feature cleanup 不写 `[]`，历史 session 仍可 load
13. 单测：用户 Clear 只清当前 session 当前 feature
14. 单测：DaemonClient reportOnce/streaming 使用同一 runtime session
15. 单测：disabled init 不创建 session，清 daemon session provider
16. Demo：重启 app 3 次后日志互不混淆
17. Demo：装 MMKV 后日志自动走 MMKV，全局 DevConnect 偏好仍可读旧值
