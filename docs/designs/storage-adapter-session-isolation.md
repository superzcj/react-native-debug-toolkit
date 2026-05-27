# StorageAdapter 抽象层 + 会话隔离存储

## Context

当前问题：
1. 日志存储硬编码 AsyncStorage + 内存回退，无法使用更快的 MMKV
2. 日志跨 app 启动混在一起，无法区分本次/上次/上上次的日志
3. 没有存储上限清理机制，日志无限增长

目标：
- 抽象存储层，支持 MMKV / AsyncStorage / 内存，运行时自动检测最优
- 日志按 app 启动会话隔离，支持查询历史会话
- 性能优化：同步写入、自动清理、懒加载

## 变更文件

| 文件 | 操作 |
|------|------|
| `src/utils/StorageAdapter.ts` | **新建** — 接口 + 3个实现 + 工厂 |
| `src/utils/SessionManager.ts` | **新建** — 会话 ID 生成、会话索引、清理 |
| `src/utils/debugPreferences.ts` | **修改** — 委托 StorageAdapter |
| `src/utils/createPersistedObservableStore.ts` | **修改** — 支持会话隔离 key |
| `src/core/initialize.ts` | **修改** — 接受 storage 配置 |
| `src/index.ts` | **修改** — 导出新类型 |
| `src/types/index.ts` | **修改** — 添加存储/会话类型 |
| `package.json` | **修改** — 添加 optional peerDependencies |

## 实现步骤

### Step 1: StorageAdapter 接口（`src/utils/StorageAdapter.ts`）

```typescript
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem?(key: string): void | Promise<void>;
  getAllKeys?(): string[] | Promise<string[]>;
}
```

三个内置实现：

**MemoryStorageAdapter** — `Map<string, string>`，纯同步，零依赖

**AsyncStorageAdapter** — 包装 `@react-native-async-storage/async-storage`，异步

**MMKVStorageAdapter** — 包装 `react-native-mmkv`，同步（关键性能优势）
- MMKV 实例通过 `new MMKV({ id: 'debug-toolkit' })` 创建
- 利用同步 `getString` / `set` 避免异步开销

工厂函数 `createDefaultStorage(): StorageAdapter`：
1. `require('react-native-mmkv')` 成功 → MMKVAdapter
2. `require('@react-native-async-storage/async-storage')` 成功 → AsyncStorageAdapter
3. 回退 MemoryAdapter

### Step 2: 会话管理（`src/utils/SessionManager.ts`）

**会话 ID**: app 每次启动生成一个 `{timestamp}-{random}` 格式的 session ID

```typescript
export interface LogSession {
  id: string;           // "1716800000000-a3f2"
  startedAt: number;    // Date.now()
  label?: string;       // 可选，用户标记
}
```

**会话索引**: 存储在固定 key `@react_native_debug_toolkit/sessions`
```typescript
// 索引结构
{
  currentSessionId: string;
  sessions: LogSession[];  // 按时间倒序
  maxSessions: 5;          // 默认保留最近5个会话
}
```

**存储 key 规则**: 日志按会话隔离
```
@react_native_debug_toolkit/sessions                    ← 会话索引
@react_native_debug_toolkit/{sessionId}/console_logs    ← 该会话的控制台日志
@react_native_debug_toolkit/{sessionId}/network_logs    ← 该会话的网络日志
@react_native_debug_toolkit/{sessionId}/track_logs      ← 该会话的追踪日志
@react_native_debug_toolkit/fab_position                ← 全局配置（不按会话隔离）
@react_native_debug_toolkit/last_tab                    ← 全局配置
```

**自动清理**: 启动时检查，超过 `maxSessions` 的旧会话：
1. 删除该会话的所有日志 key
2. 从会话索引中移除

**API**:
```typescript
class SessionManager {
  constructor(storage: StorageAdapter, maxSessions?: number);
  getCurrentSession(): LogSession;
  getSessionHistory(): LogSession[];          // 历史会话列表
  loadSessionLogs(sessionId: string, featureKey: string): Promise<T[]>;
  cleanupOldSessions(): Promise<number>;      // 返回清理的会话数
}
```

### Step 3: 重构 debugPreferences.ts

- 移除 `loadAsyncStorage()` 和 `AsyncStorageLike`
- 内部持有 `StorageAdapter` 实例（默认 `createDefaultStorage()`）
- 新增 `configureStorage(adapter)` 供外部注入
- `getPreference` / `setPreference` 委托给 adapter
- `KEYS` 只保留全局配置 key（如 `fab_position` / `last_tab` / DevConnect 配置）
- 日志 key 不再从 `KEYS` 读取，由 `SessionManager` 根据当前 session 生成完整 key

### Step 4: 修改 createPersistedObservableStore.ts

- `storageKey` 支持会话隔离：外部传入带 sessionId 的完整 key
- 恢复数据时只恢复当前会话的日志
- 历史会话日志不加载到内存（懒加载，通过 SessionManager.loadSessionLogs）

### Step 5: 初始化入口（`src/core/initialize.ts`）

```typescript
interface InitializeOptions {
  // ...existing
  storage?: StorageAdapter;           // 自定义存储
  maxLogSessions?: number;            // 最大保留会话数，默认 5
}
```

初始化流程：
1. 确定 StorageAdapter（用户传入 or 自动检测）
2. SessionManager 启动新会话 + 清理旧会话
3. 各 feature store 使用带 sessionId 的 key

### Step 6: 导出 + package.json

`src/index.ts` 新增导出：
- `StorageAdapter` 接口
- `createDefaultStorage` 工厂
- `SessionManager` 类
- `LogSession` 类型

`package.json`：
```json
"peerDependencies": {
  "@react-native-async-storage/async-storage": ">=1.0.0",
  "react-native-mmkv": ">=2.0.0",
  ...
},
"peerDependenciesMeta": {
  "@react-native-async-storage/async-storage": { "optional": true },
  "react-native-mmkv": { "optional": true },
  ...
}
```

## 性能考量

| 关注点 | 方案 |
|--------|------|
| **写入性能** | MMKV 同步写入 + 现有 2s debounce，避免每条日志触发 IO |
| **启动恢复** | 只恢复当前会话日志（最多 50 条/类型），历史会话不加载 |
| **内存占用** | 运行时只持当前会话数据，历史按需从磁盘读取 |
| **磁盘清理** | 每次启动自动清理超限旧会话，默认保留 5 个 |
| **大日志过滤** | network log body 在持久化时通过 `serialize` 截断（现有机制） |
| **MMKV 同步优势** | 日志写入不经 async 等待，debounce timer 回调直接 sync setItem |

## 验证

1. `npm run typecheck` 通过
2. `npm run build` 通过
3. Demo app 不装 MMKV → AsyncStorage 或内存，功能正常
4. Demo app 装 MMKV → 自动检测，同步写入
5. 连续启动 app 3 次 → 会话索引记录 3 个会话，日志互不干扰
6. 第 6 次启动 → 自动清理第 1 个会话的日志
7. 调用 `SessionManager.loadSessionLogs` → 能读取历史会话日志
8. 注入自定义 adapter → 正确使用注入实例
