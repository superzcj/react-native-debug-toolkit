# StorageAdapter + runtime session log storage

## Context

当前问题：
1. console/network/track 日志走全局 key，跨 app 启动混在一起
2. 日志存储只能走 AsyncStorage / memory，无法利用 MMKV 的同步读写
3. 已有单类日志条数上限，但没有 session 数量轮转和旧 session 清理
4. feature cleanup 当前会清空持久化日志，`reset()` / `replaceFeatures()` 会误删历史
5. DaemonClient 已有 streaming session，日志 session 需要复用同一来源

目标：
- 每次 app 启动生成一个 runtime session
- console/network/track 按 session 存储
- 运行时只恢复当前 session，历史 session 懒加载
- 超过保留数量后删除旧 session 日志
- feature cleanup 只释放订阅和 timer，不删除磁盘日志
- Mac sync 默认只发送当前 runtime session

## 明确边界

- 不迁移旧全局日志 key：`@react_native_debug_toolkit/console_logs` 等旧日志直接废弃
- MMKV 自动优先只作用于日志/session 存储：MMKV -> AsyncStorage -> memory
- 全局偏好继续走现有兼容链：AsyncStorage -> native preferences -> memory
- `KEYS` 不再暴露日志 key，只保留全局配置 key
- 用户手动 Clear 只清当前 session 的该 feature 日志
- feature cleanup / toolkit reset / replaceFeatures 不清磁盘日志
- 历史 session 不自动同步到 Mac；需要后续显式选择/export 才发送

## 变更文件

| 文件 | 操作 |
|------|------|
| `src/utils/StorageAdapter.ts` | **新建** - log/session storage 接口 + Memory/AsyncStorage/MMKV 实现 + 工厂 |
| `src/utils/SessionManager.ts` | **新建** - runtime session、session index、日志 key、历史读取、清理 |
| `src/utils/debugPreferences.ts` | **修改** - 保留全局偏好存储链，移除日志 key，补 `removePreference()` |
| `src/utils/createPersistedObservableStore.ts` | **修改** - 接收 storage adapter，支持 `dispose()` / `clearPersisted()` |
| `src/utils/createChannelFeature.ts` | **修改** - persist config 传 storage，cleanup 调 `dispose()` |
| `src/features/console/index.ts` | **修改** - 使用 session 日志 key，cleanup 不清历史 |
| `src/features/network/index.ts` | **修改** - 使用 session 日志 key，持久化前截断 body/data |
| `src/features/track/index.ts` | **修改** - 使用 session 日志 key |
| `src/utils/DaemonClient.ts` | **修改** - report/streaming 使用 runtime session provider |
| `src/core/initialize.ts` | **修改** - 创建 storage/session，再创建 feature |
| `src/index.ts` | **修改** - 只导出稳定类型和注入入口 |
| `src/types/index.ts` | **修改** - 导出稳定存储/session 类型 |
| `package.json` | **修改** - 添加 optional peerDependencies |
| `package-lock.json` | **修改** - 同步 optional peerDependencies 元数据 |

## Step 1: StorageAdapter 只管日志/session

`src/utils/StorageAdapter.ts`

```typescript
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}
```

内置实现：
- `MemoryStorageAdapter`：`Map<string, string>`，同步，零依赖
- `AsyncStorageAdapter`：包装 `@react-native-async-storage/async-storage`
- `MMKVStorageAdapter`：包装 `react-native-mmkv`，`new MMKV({ id: 'debug-toolkit-logs' })`

工厂：

```typescript
export function createDefaultLogStorage(): StorageAdapter {
  // 1. react-native-mmkv
  // 2. @react-native-async-storage/async-storage
  // 3. MemoryStorageAdapter
}
```

要求：
- `removeItem` 必须存在，旧 session 清理依赖它
- dynamic `require` 包在 try/catch 内，缺依赖不报错
- AsyncStorage 兼容 `default` export 和 named export
- MMKV 失败不能影响 toolkit 初始化，直接 fallback
- storage adapter 不负责全局偏好，避免装 MMKV 后丢 DevConnect 旧配置

## Step 2: SessionManager

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

规则：
- constructor 同步生成 current session，feature 创建时已有 key
- `initialize()` 异步写 session index + 清理旧 session；不额外阻塞 `initializeDebugToolkit()`
- session id 格式：`${Date.now()}-${randomHex}`
- session index key：`@react_native_debug_toolkit/sessions`
- 默认 `maxSessions = 5`
- 默认 feature keys：`console_logs` / `network_logs` / `track_logs`
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

key 规则：

```text
@react_native_debug_toolkit/sessions
@react_native_debug_toolkit/{sessionId}/console_logs
@react_native_debug_toolkit/{sessionId}/network_logs
@react_native_debug_toolkit/{sessionId}/track_logs
```

清理规则：
- index 按 `startedAt` 倒序保存
- 超过 `maxSessions` 后删除旧 session 的已知 feature key
- 只删除 session-scoped log key，不碰全局偏好 key

## Step 3: debugPreferences 保持全局偏好职责

`src/utils/debugPreferences.ts`

保留：
- `getPreference()`
- `setPreference()`
- AsyncStorage -> native preferences -> memory fallback

新增：

```typescript
export function removePreference(key: string): Promise<void>;
```

`KEYS` 只保留全局配置：
- `fabPosition`
- `lastTab`
- `computerHost`
- `daemonPort`

删除：
- `consoleLogs`
- `networkLogs`
- `trackLogs`

不做：
- 不把全局偏好迁到 MMKV
- 不新增不存在的 `connectionMode`
- 不让日志 session 清理调用 `debugPreferences`

## Step 4: createPersistedObservableStore

当前问题：`destroy()` 会写 `[]`，feature cleanup 会误删持久化日志。

调整：

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
  clearPersisted: () => void;
  dispose: () => void;
}
```

语义：
- `clearPersisted()`：清内存 + 取消 pending write + 写当前 `storageKey = []`
- `dispose()`：取消 pending write + 清内存，不写 storage
- feature `cleanup()` 只能走 `dispose()`
- 用户点击 Clear / `DebugToolkit.clearAll()` 走 `clearPersisted()`
- `destroy` 命名移除，避免继续表达“清空资源+清磁盘”的混合语义

## Step 5: feature 日志 key 接入

新增内部 runtime context，不放进公开 feature config：

```typescript
interface LogRuntimeContext {
  sessionManager: SessionManager;
  logStorage: StorageAdapter;
}
```

初始化路径：
- `initializeDebugToolkit()` 创建 `LogRuntimeContext`
- 内置 feature factory 通过内部第二参数拿 runtime context
- 公开 `createNetworkFeature(config)` 等调用不传 context 时，使用默认 runtime context

console：
- `storageKey = sessionManager.getLogStorageKey('console_logs')`
- `clear()` 清当前 session console logs
- `cleanup()` 只释放 console hook + dispose store

network：
- `storageKey = sessionManager.getLogStorageKey('network_logs')`
- `serialize` 持久化前截断 `request.body` / `response.data`
- 截断逻辑复用 `deviceReport` 的 body/data sanitize 思路

track：
- `storageKey = sessionManager.getLogStorageKey('track_logs')`

navigation/zustand：
- 当前不持久化，不接入 session

## Step 6: initialize 组装顺序

`src/core/initialize.ts`

```typescript
interface InitializeOptions {
  features?: FeatureConfigs;
  enabled?: boolean;
  logStorage?: StorageAdapter;
  maxLogSessions?: number;
}
```

流程：
1. 先解析 `enabled`
2. 如果 disabled：清掉 daemon session provider，`DebugToolkit.reset()`，返回
3. `logStorage = options.logStorage ?? createDefaultLogStorage()`
4. `sessionManager = new SessionManager(logStorage, { maxSessions: options.maxLogSessions })`
5. `daemonClient.setSessionProvider(() => sessionManager.getCurrentSession())`
6. 用 runtime context 创建内置 features
7. `DebugToolkit.replaceFeatures(resolvedFeatures)`
8. `sessionManager.initialize().catch(...)`
9. restore DevConnect + daemon streaming

注意：
- `initializeDebugToolkit()` 仍返回 `Promise<typeof DebugToolkit>`
- 不额外等待 session index 写入；current session 已同步可用
- disabled 不创建新 session，不启动清理
- disabled 必须清 session provider，避免复用上一次 init 的 session

## Step 7: DaemonClient session 统一

当前 DaemonClient 内部自己生成 streaming session。改为：

```typescript
type SessionProvider = () => SessionInfo;

daemonClient.setSessionProvider(provider);
daemonClient.clearSessionProvider();
```

规则：
- streaming full report 使用 provider 返回的 runtime session
- `reportOnce()` 默认也带当前 session
- 没有 provider 时 fallback 内部 session，保证低层 API 单独使用不崩
- `disconnect()` 不清 provider session，只断 stream
- `_resetForTesting()` 清 provider

## Step 8: 导出策略

公开稳定 API：
- `StorageAdapter`
- `LogSession`
- `LogFeatureKey`
- `SessionManagerOptions`
- `createDefaultLogStorage`
- `MemoryStorageAdapter`

暂不公开：
- `SessionManager`
- `AsyncStorageAdapter`
- `MMKVStorageAdapter`

原因：
- `SessionManager` 是 runtime 内部协调器，过早公开会固定历史读取/清理 API
- 具体 native adapter 类属于实现细节；用户只需要传 `StorageAdapter`
- 后续做历史 session UI/export 时，再决定是否公开 `getSessionHistory()` / `loadSessionLogs()`

`package.json`：

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

| 操作 | 行为 |
|------|------|
| Send Once | 当前 session 的 full report |
| Start Live Sync | 当前 session full report + 当前 session deltas |
| App 重启后 live sync | 新 runtime session，新 full report |
| 历史 session | 不自动发送，未来通过显式选择/export |

## 性能考量

| 关注点 | 方案 |
|--------|------|
| 写入性能 | 保留 2s debounce；MMKV 路径同步写 |
| 启动恢复 | 只读当前 session 的持久化日志 |
| 历史读取 | `loadSessionLogs()` 按 session + feature 懒加载，先内部使用 |
| 内存占用 | runtime store 只持当前 session |
| 磁盘清理 | `cleanupOldSessions()` 删除超限 session 的已知 feature key |
| 大日志 | network persist 前截断 body/data |
| reset/replaceFeatures | 只释放订阅和 timer，不删除磁盘日志 |

## 验证

1. `npm run typecheck`
2. `npm test -- --runInBand --watchman=false`
3. `npm run build`
4. `npm pack --dry-run`
5. 单测：StorageAdapter fallback 顺序 MMKV -> AsyncStorage -> memory
6. 单测：AsyncStorage default/named export 都可用
7. 单测：debugPreferences 仍按 AsyncStorage -> native preferences -> memory 读取全局偏好
8. 单测：`KEYS` 保留 `daemonPort`，不再包含 console/network/track log key
9. 单测：SessionManager constructor 同步生成 current session
10. 单测：连续 3 次 session 初始化后 index 倒序保存
11. 单测：第 6 次启动清理第 1 个 session 的 console/network/track key
12. 单测：feature cleanup 不写 `[]`，历史 session 仍可 load
13. 单测：用户 Clear 只清当前 session 当前 feature
14. 单测：DaemonClient reportOnce/streaming 使用同一个 runtime session
15. 单测：disabled init 不创建 session，并清 daemon session provider
16. Demo：重启 app 3 次后日志互不混淆
17. Demo：装 MMKV 后日志/session 自动走 MMKV，全局 DevConnect 偏好仍可读取旧值
