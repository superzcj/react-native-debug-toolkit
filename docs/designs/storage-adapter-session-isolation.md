# StorageAdapter 抽象层 + 会话隔离存储

## Context

当前问题：
1. 日志存储硬编码 AsyncStorage + 内存回退，无法使用更快的 MMKV
2. console/network/track 使用全局 key，跨 app 启动日志混在一起
3. 已有单类日志条数上限，但没有 session 数量轮转和旧 session 清理
4. feature cleanup 当前会清空持久化日志，不能安全保留历史 session
5. DaemonClient 已有 streaming session，新日志 session 需要统一来源，避免两个 session id

目标：
- 抽象存储层，支持 MMKV / AsyncStorage / 内存
- 每次 app 启动生成一个 runtime session，日志按 session 隔离
- 历史 session 懒加载，运行时只恢复当前 session
- 超过保留数量后删除旧 session 日志
- feature cleanup 只释放订阅和 timer，不删除历史日志

## 明确边界

- 不迁移旧全局日志 key：`@react_native_debug_toolkit/console_logs` 等旧数据直接废弃
- MMKV 自动优先：装了 `react-native-mmkv` 就用 MMKV；否则 AsyncStorage；否则内存
- `KEYS` 不再暴露日志 key，只保留全局配置 key
- 用户手动 Clear 只清当前 session 的该 feature 日志
- feature cleanup / toolkit reset / replaceFeatures 不清磁盘日志

## 变更文件

| 文件 | 操作 |
|------|------|
| `src/utils/StorageAdapter.ts` | **新建** — 接口 + Memory/AsyncStorage/MMKV 实现 + 工厂 |
| `src/utils/SessionManager.ts` | **新建** — runtime session、session index、日志 key、历史读取、清理 |
| `src/utils/debugPreferences.ts` | **修改** — 委托 StorageAdapter，只保留全局配置 key |
| `src/utils/createPersistedObservableStore.ts` | **修改** — 支持 `dispose()`，cleanup 不再写空数组 |
| `src/utils/createChannelFeature.ts` | **修改** — feature cleanup 调 `dispose()`，clear 才清当前 session |
| `src/features/console/index.ts` | **修改** — 使用 session 日志 key，cleanup 不清历史 |
| `src/features/network/index.ts` | **修改** — 使用 session 日志 key，持久化前截断 body |
| `src/features/track/index.ts` | **修改** — 使用 session 日志 key |
| `src/utils/DaemonClient.ts` | **修改** — streaming report 使用同一个 runtime session |
| `src/core/initialize.ts` | **修改** — 创建 storage/session，再创建 feature |
| `src/index.ts` | **修改** — 导出新类型和工具 |
| `src/types/index.ts` | **修改** — 导出存储/session 类型 |
| `package.json` | **修改** — 添加 optional peerDependencies |
| `package-lock.json` | **修改** — 同步 optional peerDependencies 元数据 |

## 实现步骤

### Step 1: StorageAdapter 接口

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
- `MMKVStorageAdapter`：包装 `react-native-mmkv`，`new MMKV({ id: 'debug-toolkit' })`

工厂：
```typescript
export function createDefaultStorage(): StorageAdapter {
  // 1. react-native-mmkv
  // 2. @react-native-async-storage/async-storage
  // 3. MemoryStorageAdapter
}
```

要求：
- `removeItem` 必须存在，旧 session 清理依赖它
- dynamic `require` 包在 try/catch 内，缺依赖不报错
- AsyncStorage 要兼容 `default` export 和 named export 两种 mock/运行形态

### Step 2: SessionManager

`src/utils/SessionManager.ts`

```typescript
export type LogFeatureKey = 'console_logs' | 'network_logs' | 'track_logs';

export interface LogSession {
  id: string;
  startedAt: number;
  label?: string;
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
- constructor 同步生成 current session，保证 feature 创建时已有 key
- `initialize()` 异步写 session index + 清理旧 session；不阻塞 `initializeDebugToolkit()` 返回
- session id 格式：`${Date.now()}-${randomHex}`
- session index key：`@react_native_debug_toolkit/sessions`
- 默认 `maxSessions = 5`
- 默认 feature keys：`console_logs` / `network_logs` / `track_logs`

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
@react_native_debug_toolkit/fab_position
@react_native_debug_toolkit/last_tab
@react_native_debug_toolkit/computer_host
@react_native_debug_toolkit/connection_mode
```

### Step 3: debugPreferences

`src/utils/debugPreferences.ts`

- 删除 `loadAsyncStorage()` / `AsyncStorageLike`
- 模块内持有当前 `StorageAdapter`
- 新增：
```typescript
export function configureStorage(adapter: StorageAdapter): void;
export function getConfiguredStorage(): StorageAdapter;
```
- `getPreference` / `setPreference` / `removePreference` 委托 adapter
- `KEYS` 只保留全局配置：
  - `fabPosition`
  - `lastTab`
  - `computerHost`
  - `connectionMode`
- 删除 `consoleLogs` / `networkLogs` / `trackLogs`

### Step 4: createPersistedObservableStore

问题：当前 `destroy()` 会 `setPreference(storageKey, '[]')`，feature cleanup 会误删历史。

调整：
```typescript
export interface PersistedObservableStore<T> extends ObservableStore<T> {
  nextId: () => string;
  ready: Promise<void>;
  clearPersisted: () => void;
  dispose: () => void;
}
```

语义：
- `clearPersisted()`：清内存 + 异步写当前 `storageKey = []`
- `dispose()`：清 timer + 清内存，不写 storage
- `cleanup()` 只能走 `dispose()`
- 用户点击 Clear 走 `clearPersisted()`

### Step 5: feature 日志 key 接入

新增 feature 创建参数：
```typescript
interface LogStorageConfig {
  sessionManager: SessionManager;
}
```

console：
- `storageKey = sessionManager.getLogStorageKey('console_logs')`
- `clear()` 清当前 session console logs
- `cleanup()` 只释放 console hook + dispose store

network：
- `storageKey = sessionManager.getLogStorageKey('network_logs')`
- `serialize` 持久化前截断 `request.body` / `response.data`
- 截断规则复用 device report 的 sanitize 思路，避免大 body 直接写入本地存储

track：
- `storageKey = sessionManager.getLogStorageKey('track_logs')`

navigation/zustand：
- 当前不持久化，不接入 session

### Step 6: initialize 组装顺序

`src/core/initialize.ts`

```typescript
interface InitializeOptions {
  features?: FeatureConfigs;
  enabled?: boolean;
  storage?: StorageAdapter;
  maxLogSessions?: number;
}
```

流程：
1. 先解析 `enabled`
2. 如果 disabled：`DebugToolkit.reset()` 后返回，不创建新 session
3. `storage = options.storage ?? createDefaultStorage()`
4. `configureStorage(storage)`
5. `sessionManager = new SessionManager(storage, { maxSessions })`
6. `daemonClient.setSessionProvider(() => sessionManager.getCurrentSession())`
7. 创建 feature 时传入 `sessionManager`
8. `DebugToolkit.replaceFeatures(resolvedFeatures)`
9. `sessionManager.initialize().catch(...)`
10. restore DevConnect + daemon streaming

注意：
- `initializeDebugToolkit()` 仍同步返回 `DebugToolkit`
- 不等待 session index 写入；当前 session id 已同步可用
- disabled 不创建新 session，不启动清理

### Step 7: DaemonClient session 统一

当前 DaemonClient 内部自己生成 streaming session。改为：

```typescript
type SessionProvider = () => SessionInfo;

daemonClient.setSessionProvider(provider);
```

规则：
- streaming full report 使用 provider 返回的 runtime session
- `reportOnce()` 默认也带当前 session
- 没有 provider 时再 fallback 内部生成，防止低层 API 单独使用崩溃
- `disconnect()` 不清 provider session，只断 stream

### Step 8: 导出 + package.json

`src/index.ts` 新增导出：
- `StorageAdapter`
- `createDefaultStorage`
- `MemoryStorageAdapter`
- `AsyncStorageAdapter`
- `MMKVStorageAdapter`
- `SessionManager`
- `LogSession`
- `LogFeatureKey`

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

## 性能考量

| 关注点 | 方案 |
|--------|------|
| 写入性能 | 保留 2s debounce；MMKV 路径同步写 |
| 启动恢复 | 只读当前 session 的持久化日志 |
| 历史读取 | `loadSessionLogs()` 按 session + feature 懒加载 |
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
7. 单测：SessionManager constructor 同步生成 current session
8. 单测：连续 3 次 session 初始化后 index 倒序保存
9. 单测：第 6 次启动清理第 1 个 session 的 console/network/track key
10. 单测：feature cleanup 不写 `[]`，历史 session 仍可 load
11. 单测：用户 Clear 只清当前 session 当前 feature
12. 单测：DaemonClient reportOnce/streaming 使用同一个 runtime session
13. Demo：重启 app 3 次后日志互不混淆
14. Demo：装 MMKV 后自动走 MMKV，同步读写正常
