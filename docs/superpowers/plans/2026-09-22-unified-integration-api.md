# 默认完整接入与统一 Feature 配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App 通过 `withDebugToolkit(App)` 获得全部十二类功能；统一对象配置补充业务能力，空配置正常显示，AI 仅阅读公开文档即可完成接入和验证。

**Architecture:** 将配置解析、页面注册、行为安装分开。一个根宿主持有可取消的运行时，日志存储、共享 XHR 和订阅均按所有者释放；业务源连接到已存在的功能页。公开入口只保留 HOC、`debug` 与类型，可选 Zustand 适配器使用子路径。

**Tech Stack:** TypeScript、React Native、React、现有 MMKV/SessionManager、Jest、Demo 的 React 19 renderer、Bob、RN CLI、iOS CocoaPods、Android Gradle。

**Spec:** [默认完整接入与统一 Feature 配置设计](../specs/2026-09-22-unified-integration-api-design.md)。设计已确认；本计划尚待审阅。实现前同时阅读设计与本计划。

## Global Constraints

- 破坏性主版本变更，不保留旧 API、字段别名和兼容初始化路径；本次不执行 npm 发布。
- 唯一根入口 `withDebugToolkit(App, config?)`，在模块作用域创建；全部功能只能使用对象配置。
- 默认十二类：`network`、`console`、`native`、`state`、`navigation`、`track`、`connect`、`clipboard`、`history`、`environment`、`accounts`、`tabs`。
- 省略配置、`{}`、省略业务输入均保留页面；只有显式 `enabled: false` 或全局关闭移除页面。
- 未提供输入不启动对应行为：无 ref 不轮询、无 source 不订阅、无环境列表不改 URL、无账号/回调不认证。
- 已提供的非法数据仍报带字段路径的错误；单功能错误留在该页，其余功能继续；顶层错误停用 Toolkit。
- `maxLogs` 默认 200；`native.pollIntervalMs` 默认 500、最小 100，数值只接受合法正整数。
- `history.maxSessions` 默认 5，包含当前会话；Network 每会话持久化 `min(maxLogs, 30)`，Console/Native/Track 为 `min(maxLogs, 50)`；State/Navigation 不持久化。
- History 关闭不读写或清理历史日志，偏好独立存储；旧历史保留，下次开启再恢复，关闭期间日志不补写。
- 全局门禁：显式 enabled > 原生构建模式 > 可靠的 `__DEV__` > false；Release 即使显式启用也不自动发现/上传。
- 单 JS runtime 一个宿主；取消 token 必须覆盖每次异步延续。本地初始化上限 10 秒，Hub 无限重试和未来业务供给不纳入等待。
- MMKV 是真实原生依赖；存储运行时失败可降级内存，不把降级描述成免安装。验证当前声明 RN 下限及 Demo RN 0.85.1；下限不成立则修正声明并验证新的下限。
- 不新增接入 Skill、setup 自动修改工具、doctor/nonce 协议、第二个 bootstrap 入口或新的第十三类功能。
- Demo 日常运行与干净 tarball 消费者分别验收；只有公开文档的 AI 接入单列结果，不能用静态编译替代设备运行证据。
- 执行时保留已有修改，尤其未跟踪的 `docs/blog/`。本计划不是修改该目录或重置仓库的授权。

## Review Focus

1. **空业务配置遇到旧偏好**：空环境不恢复旧地址，空账号不从最近 ID 伪造账号；任务 6、7 用预置旧存储验证。
2. **旧异步操作晚于重挂载完成**：旧宿主、XHR cleanup、恢复任务不能覆盖新宿主；任务 2、3、10 使用延迟 Promise 和所有权测试。
3. **登录自己更新认证快照**：展示字段变化不能取消自身；目标对象替换、scope 变化必须取消，忽略 signal 的业务 Promise 也不能晚提交；任务 7 验证。
4. **“空”与“失败”混淆**：缺输入是正常空态，source 抛错/非法快照、MMKV 故障、缺原生能力必须显示真实原因；任务 4、5、7、8、10 验证。
5. **测试环境掩盖安装缺陷**：父目录 alias、依赖提升、旧 App/Session 日志不能证明消费者接入；任务 12、14 在独立目录和当前会话验证。

---

## 执行约定与文件结构

这是同一个接入链路的实施计划，按 1 → 14 顺序执行。每个任务有自己的测试闭环；前置任务引入内部能力，任务 10 才切换公共入口，期间不发布中间产物。代码块标为“算法”的内容用于约束迁移逻辑，不是可直接粘贴的完整实现；标为测试的代码使用下述确定接口。

执行开始记录 `git status`、Node/npm/Xcode/Java/Android SDK 版本和基线结果。任务 1–9 迁移内部签名时同步更新现有内部调用方以保持类型检查；这些调用点适配不构成旧 API 的兼容承诺，旧入口统一在任务 10 删除。现有审计发现 Demo lint 有 ESLint/@typescript-eslint 运行错误；先复现并在 Demo 任务中修复工具版本/配置原因，不靠禁用规则掩盖。根 Jest 只运行 `.test.ts/.test.js`，React HOC/UI 测试放在 Demo 的 React 19 renderer 环境，避免给根 React 18 工程硬塞 renderer 19。

本文 shell 示例遵循仓库 RTK 约定。命令默认在仓库根目录执行；某任务测试失败时先定位到本任务，不为让测试绿而修改不相关行为。每次提交仅暂存该任务文件，禁止 `git add .`。

| 文件/目录 | 变更和单一职责 | 任务 |
| --- | --- | --- |
| `src/types/config.ts`, `src/types/debug.ts`, `src/types/source.ts` | 新公共配置、动作结果、数据源类型 | 1 |
| `src/core/config.ts`, `src/core/featureCatalog.ts` | 校验/默认值；十二类稳定标识与注册定义 | 1 |
| `src/core/runtime.ts`, `src/core/runtimeTypes.ts`, `src/core/host.ts` | 本地生命周期；内部合同；单宿主所有权 | 2 |
| `src/utils/xhrService.ts` | collector/rewriter 独立所有权 | 3 |
| `src/utils/logRuntime.ts`, `StorageAdapter.ts`, `SessionManager.ts` | 内存/持久化策略、偏好隔离 | 4 |
| `src/features/state/index.ts`, `src/adapters/zustand.ts` | 通用状态观察、可选适配器 | 5 |
| `src/features/navigation/index.ts`, `src/utils/observeSource.ts` | 导航绑定；安全读取/订阅 | 5 |
| `src/features/environment/*`, `src/features/quickAccounts/*` | 保留现有成熟实现，迁移输入/生命周期 | 6、7 |
| `src/features/tabs/index.tsx`, `TabsTab.tsx` | 固定 Custom 页与组件/source 运行时 | 8 |
| `src/features/clipboard/*`, `src/utils/copyToComputer.ts` | 通道明确的主动文本操作 | 8 |
| `src/features/devConnect/*`, `src/utils/HubEndpointResolver.ts`, `HubClient.ts` | 自动 App 标识、地址优先级、取消连接 | 9 |
| `src/core/createFeatureDrivers.ts`, `src/core/debug.ts`, `src/withDebugToolkit.tsx` | 聚合驱动、公开动作、唯一 HOC | 10 |
| `src/core/DebugToolkit.tsx`, `DebugToolkitProvider.tsx`, `src/ui/panel/*` | 内部展示容器与统一状态 | 10 |
| `src/index.ts`, `src/types/index.ts` | 新主版本出口，删除旧出口 | 10 |
| `Demo/App.tsx`, `Demo/debug.config.tsx`, `Demo/ZeroConfigApp.tsx`, `Demo/Showcase.tsx` | 同一套功能的两种业务供给 | 11 |
| `scripts/consumer-fixture.mjs`, `scripts/verify-package.mjs` | 打包和隔离消费者构造/校验 | 12 |
| `docs/examples/integration/*`, `docs/integration*.md`, `docs/configuration*.md` | 可编译示例和中英公开文档 | 13 |
| `docs/validation/unified-integration.md` | 构建、运行、AI 文档接入证据 | 14 |

下文给出的新文件应按职责创建；旧 `features/zustand` 的日志展示组件迁移到 `features/state/StateLogTab.tsx`，旧传输标识仅在内部映射；不做整仓目录重排。

## Task 1：配置合同、默认值和错误归属

**Files**
- Create: `src/types/config.ts`, `src/types/debug.ts`, `src/types/source.ts`, `src/core/config.ts`, `src/core/featureCatalog.ts`
- Create/Test: `src/__tests__/core/config.test.ts`, `type-tests/integration.tsx`, `type-tests/tsconfig.json`
- Modify: `src/types/feature.ts`, `src/types/navigation.ts`, `package.json`

**Interfaces**

```ts
// source.ts
export interface DebugSource<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
export interface StateAdapter<T = unknown> extends DebugSource<T> { id: string }
// featureCatalog.ts
export const FEATURE_KEYS = [
  'network', 'console', 'native', 'state', 'navigation', 'track',
  'connect', 'clipboard', 'history', 'environment', 'accounts', 'tabs',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type LogFeatureKey = Extract<FeatureKey,
  'network' | 'console' | 'native' | 'state' | 'navigation' | 'track'>;
// config.ts：对应设计 §4.2 的十二个配置对象。
export interface ConfigIssue { path: string; message: string }
export type NormalizedFeature = {
  key: FeatureKey;
  enabled: boolean;
  options: Readonly<Record<string, unknown>>;
  issues: readonly ConfigIssue[];
};
export interface NormalizedConfig {
  enabled: boolean | undefined;
  locale: 'en' | 'zh-CN' | undefined;
  issues: readonly ConfigIssue[]; // 仅顶层问题
  features: Readonly<Record<FeatureKey, NormalizedFeature>>;
}
export function normalizeConfig(input?: unknown): NormalizedConfig;
```

`config.ts` 同时维护 `FEATURE_FIELDS: Readonly<Record<FeatureKey, readonly string[]>>` 与 `FEATURE_DEFAULTS: Readonly<Record<FeatureKey, Readonly<Record<string, unknown>>>>`，解析和文档检查共用，不再复制第三份默认值。字段列表如下，全部另外允许 `enabled`：

```text
network: maxLogs, excludeUrls
console: maxLogs
native: maxLogs, minLevel, includeTags, excludeTags, pollIntervalMs
state: maxLogs, adapters
navigation: maxLogs, ref
track: maxLogs
connect: appId, endpoint
clipboard: （无业务字段）
history: maxSessions
environment: items, defaultId, onChange
accounts: items, currentId, scopeKey, contextLabel, isAuthenticated, currentDetails,
          source, onSwitch, onRollback, onSuccess, onError, closeOnSuccess
tabs: items
```

`options` 是验证后的内部边界，不导出给用户。每个驱动入口用自己的字段解析器转换到具体类型，不让业务依赖 `unknown`。公共 `DebugToolkitConfig<A, S>` 按设计 §4.4 的 AccountsData/DebugTab 联合类型与 §4.2 全部字段组合；不得将互斥关系改为可选字段大合集。

- [ ] 添加以下运行时测试，并用 `test.each(FEATURE_KEYS)` 对每项测试省略、`{}`、`{ enabled: false }`、boolean、数组、未知字段、合法供给。测试账号扩展字段允许，功能对象未知字段拒绝。

```ts
import { normalizeConfig } from '../../core/config';
import { FEATURE_KEYS } from '../../core/featureCatalog';
test('empty input enables all feature pages', () => {
  const result = normalizeConfig();
  expect(result.issues).toEqual([]);
  expect(FEATURE_KEYS.filter(key => result.features[key].enabled)).toEqual(FEATURE_KEYS);
  expect(result.features.accounts.issues).toEqual([]);
  expect(result.features.tabs.issues).toEqual([]);
});
test('feature errors stay local and carry the field path', () => {
  const result = normalizeConfig({ network: { maxLogs: 0 }, accounts: {} });
  expect(result.issues).toEqual([]);
  expect(result.features.network.issues[0]?.path).toBe('network.maxLogs');
  expect(result.features.accounts.issues).toEqual([]);
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/core/config.test.ts`，预期新模块不存在而失败。
- [ ] 将设计中的账号/Tab 类型合同写入 `types/config.ts`；导航公共 ref 明确支持 `{ current: DebugNavigationRef | null }`，其中 `DebugNavigationRef` 定义 `isReady?(): boolean`、`getCurrentRoute(): { key?: string; name: string } | undefined`、`getRootState(): unknown`、`addListener(event: 'state', callback: () => void): () => void`。不导入 React Navigation 运行时依赖。
- [ ] 实现逐字段解析；顶层允许 `enabled/locale` 与 FEATURE_KEYS，空对象补默认，`undefined` 等同省略，`null` 按字段规则判断。正整数拒绝 NaN/Infinity/小数/零/负数；RegExp 保留对象、不 JSON 克隆。解析时固定参数和列表结构，但保留 callback/ref/source 与账号项对象身份；禁止 deep clone 破坏 source/账号 generation 语义。环境/账号/Tab 的深层约束分别由任务 6/7/8 的解析器补全。

```text
算法：解析全局字段 → 为每个固定 key 建立默认配置 → 解析调用方同 key 对象。
字段错误添加到该 key 的 issues；始终保留这条 feature 配置。
未知顶层字段添加全局 issues；不把旧字段自动映射为新字段。
显式 disabled 的对象仍检查字段正确性，但绝不安装驱动行为。
```

- [ ] 新增 `type-tests/tsconfig.json`：继承根配置，`noEmit: true`、`rootDir: '..'`、`noUnusedLocals: false`，include `./**/*.tsx`；脚本 `typecheck:api` 执行 `tsc -p type-tests/tsconfig.json`。最初从类型模块导入，任务 10 改为公共入口。加入以下片段，并完整覆盖设计 §4.4 正反例。

```tsx
import type { DebugToolkitConfig } from '../src/types/config';
const empty = { accounts: {}, environment: {}, tabs: {} } satisfies DebugToolkitConfig;
// @ts-expect-error Feature boolean is not supported.
const oldShape = { network: true } satisfies DebugToolkitConfig;
// @ts-expect-error Provided records must have title.
const invalidAccount = { accounts: { items: [{ id: 'a' }] } } satisfies DebugToolkitConfig;
```

- [ ] 运行本任务 Jest 和 `rtk proxy npm run typecheck:api`，均应通过；添加泛型推断、混合快照/普通 Tab、错误 snapshot、App props 保留用例，不能用 `any`/调用方断言消除错误。
- [ ] 仅暂存本任务 Files，提交 `feat: define unified toolkit configuration contract`。

## Task 2：单宿主运行时与取消边界

**Files**
- Create: `src/core/runtimeTypes.ts`, `src/core/runtime.ts`, `src/core/host.ts`
- Test: `src/__tests__/core/runtime.test.ts`, `src/__tests__/core/host.test.ts`
- Modify: `src/types/debug.ts`

**Interfaces**

```ts
import type { NormalizedConfig, NormalizedFeature, ConfigIssue } from './config';
import type { FeatureKey } from './featureCatalog';
export type FeaturePhase = 'initializing' | 'ready' | 'empty' | 'unavailable' | 'error';
export interface FeatureStatus {
  phase: FeaturePhase;
  issues: readonly ConfigIssue[];
}
export type ReadyResult = {
  status: 'ready' | 'partial' | 'disabled' | 'not_started' | 'cancelled' | 'initialization_timeout' | 'error';
  features: Partial<Record<FeatureKey, FeatureStatus>>;
  issues: readonly ConfigIssue[];
};
export interface FeatureContext {
  readonly owner: symbol;
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  setStatus(status: FeatureStatus): void;
}
export interface FeatureDriver {
  start(context: FeatureContext): void | Promise<void>;
  dispose(): void;
}
export interface RuntimeDependencies {
  detectDebugBuild(signal: AbortSignal): Promise<boolean | undefined>;
  fallbackDev: boolean | undefined;
  createDriver(config: NormalizedFeature): FeatureDriver;
  publish(features: Partial<Record<FeatureKey, FeatureStatus>>): void;
}
export interface ToolkitRuntime {
  readonly ready: Promise<ReadyResult>;
  start(): void;
  dispose(): void;
}
export function createToolkitRuntime(config: NormalizedConfig, deps: RuntimeDependencies): ToolkitRuntime;
export function claimHost(owner: symbol, runtime: ToolkitRuntime): { release(): void };
export function getActiveRuntime(): ToolkitRuntime | null;
```

`publish` 只发布已启用的页面状态，先注册全部，再启动行为；具体展示容器在任务 10 接线。运行时是实例，模块级 `host` 只存一个活动租约；测试不依赖全局 reset 清除别人的所有权。

- [ ] 写延迟构建检测测试：取消后 resolve(true)，不能 createDriver/publish 页面。另测两次 start 幂等、重复 claim 报明确错误、重复 release 无害、旧 release 不影响新租约。

```ts
import { createToolkitRuntime } from '../../core/runtime';
import { normalizeConfig } from '../../core/config';
test('late build detection cannot install after dispose', async () => {
  let finish!: (value: boolean) => void;
  const detection = new Promise<boolean>(resolve => { finish = resolve; });
  const createDriver = jest.fn(() => ({ start: jest.fn(), dispose: jest.fn() }));
  const runtime = createToolkitRuntime(normalizeConfig(), {
    detectDebugBuild: () => detection, fallbackDev: true,
    createDriver, publish: jest.fn(),
  });
  runtime.start();
  runtime.dispose();
  finish(true);
  expect((await runtime.ready).status).toBe('cancelled');
  expect(createDriver).not.toHaveBeenCalled();
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/core/runtime.test.ts src/__tests__/core/host.test.ts`，预期缺实现失败。
- [ ] 实现 start/dispose：调用 start 时立即具备 ready Promise；先解析全局问题/门禁，门禁完成后一次 publish 全部页面，再独立启动有效驱动。每个功能持有自己的 AbortController；一个驱动失败释放自己并标 error，不中止其他功能。
- [ ] 实现覆盖构建检测和全部本地初始化的 10 秒 deadline；超时使本轮宿主 token 失效、释放全部已启动行为，返回 initialization_timeout；保留已注册页面的超时说明，不继续采集。整个宿主过期后所有 continuation 不再发布。总结果 `ready` 允许 empty，`partial` 表示存在 error/unavailable；全局问题为 error。失败 callback 写原始 console，避免被采集后递归。

```text
算法：dispose 先使 owner 失效，再 abort 各 signal，再逆序 dispose 已创建驱动。
所有 await 的后续必须检查宿主 owner 和该驱动 signal。
驱动 start 结束但仍 initializing 时设 ready；主动报告 empty/unavailable 不覆盖。
10 秒到期先使宿主 token 失效，统一 abort + dispose，再终结结果 initialization_timeout。
已注册页面通过最终一次受控状态提交展示超时；过期驱动无权再发布。
尚未挂载：debug.ready → not_started；disabled 不创建驱动，也不触发存储初始化。
```

- [ ] 补 fake timers 测试：无限 start 10 秒结束、迟到结果不能再 publish；一个抛错不丢其他十一页；十二个 empty 的 ready 不超时；原生 unknown/fallback false/explicit enabled 优先级正确；构建检测自身永不返回也在 10 秒终结。运行本任务测试，预期全部通过。
- [ ] 仅暂存本任务 Files，提交 `feat: manage toolkit host lifecycle with cancellation`。

## Task 3：XHR collector 与 rewriter 分别拥有资源

**Files**
- Create: `src/utils/xhrService.ts`
- Modify: `src/features/network/networkInterceptor.ts`, `src/features/network/index.ts`, `src/utils/urlRewriter.ts`
- Test: `src/__tests__/features/networkInterceptor.test.ts`, `src/__tests__/utils/xhrService.test.ts`

**Interfaces**

```ts
export interface XhrRecord {
  url: string; method: string; status: number; startedAt: number; durationMs: number;
  requestBody?: unknown; responseBody?: unknown;
}
export function acquireCollector(owner: symbol, emit: (record: XhrRecord) => void): () => void;
export function acquireRewriter(owner: symbol, rewrite: (url: string) => string): () => void;
```

网络日志字段转换留在 Network 驱动；XHR 服务只负责转发完成记录和 open 前改写。允许多个 collector；单宿主只安装一个 Environment rewriter，冲突 rewriter 注册明确报错，不能默默选择。

- [ ] 添加真实 mock XHR 的组合测试；沿用 `networkInterceptor.test.ts` 已有 mock，将“无 collector 只有 rewriter”发一次请求，断言只改 URL、不构造/发送记录。对旧 owner 释放测试可先从返回值合同开始：

```ts
import { acquireRewriter } from '../../utils/xhrService';
test('an old release is idempotent after another owner installs', () => {
  const releaseOld = acquireRewriter(Symbol('old'), url => url);
  releaseOld();
  const releaseNew = acquireRewriter(Symbol('new'), url => url);
  expect(() => releaseOld()).not.toThrow();
  releaseNew();
});
```

该测试还须调用 mock XHR 检查新 rewrite 仍执行，不能只检查“不抛错”。
- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/features/networkInterceptor.test.ts src/__tests__/utils/xhrService.test.ts`，预期新增所有权测试失败。
- [ ] 实现 symbol→registration 映射，release 删除自身 registration identity；首个注册安装 hook，最后一个释放还原原始 XHR 方法。仅存在 collector 才包装 response/生成日志，只有 rewriter 时不记录 body/timing。

```text
算法：open(url) → 当前有效 rewriter(url) → 原始 open。
存在 collector：监听完成，复制不可变记录并分别 emit；一个 emit 抛错不能阻断请求。
release 捕获该注册对象；Map.get(owner) 等于该对象时才 delete。
最后一个使用者释放时恢复方法；正在飞行的请求不能再通知已释放 collector。
```

- [ ] Network cleanup 删除无 owner 的 `setUrlRewriter(null)`；加入 excludeUrls 字符串/RegExp 测试，含带 g 标记 RegExp 的重复请求结果一致。补 Network/Environment 四种启停组合、连续挂卸、请求中途释放测试，运行本任务测试应通过。
- [ ] 仅暂存本任务 Files，提交 `fix: isolate xhr collection and rewrite ownership`。

## Task 4：日志运行时、历史策略与原生采集能力

**Files**
- Modify: `src/utils/logRuntime.ts`, `StorageAdapter.ts`, `SessionManager.ts`, `createChannelFeature.ts`, `createPersistedObservableStore.ts`, `debugPreferences.ts`
- Modify: `src/features/network/index.ts`, `src/features/console/index.ts`, `src/features/nativeLogs/index.ts`, `nativeLogsBridge.ts`, `src/features/track/index.ts`, `src/features/sessionHistory/index.ts`, `SessionHistoryTab.tsx`
- Test: `src/__tests__/utils/logRuntime.test.ts`, `src/__tests__/features/sessionLogStorage.test.ts`, `src/__tests__/features/nativeLogs.test.ts`, `src/__tests__/features/featureLifecycle.test.ts`

**Interfaces**

```ts
// 改造现有 LogRuntimeContext；StorageAdapter/SessionManager 复用既有类型。
export interface LogRuntimeContext {
  logStorage: StorageAdapter;
  preferenceStorage: StorageAdapter;
  sessionManager: SessionManager;
  initialize(signal: AbortSignal): Promise<void>;
  dispose(): void;
  historyAvailable: boolean;
}
export interface LogRuntimeOptions {
  history: { enabled: boolean; maxSessions: number };
  logDisk: StorageAdapter;
  preferenceDisk: StorageAdapter;
}
export function createLogRuntime(options: LogRuntimeOptions): LogRuntimeContext;
export function persistedLogLimit(feature: 'network' | 'console' | 'native' | 'track', maxLogs: number): number;
```

生产 storage 工厂在通过门禁后才调用；options 不提供“默认 MMKV”回退。History off 不创建日志磁盘实例：logDisk 注入内存占位，preferenceDisk 仍可独立初始化原生存储；测试可以注入磁盘 spy 证明零访问。移除所有 collector 对 `getDefaultLogRuntime()` 的懒创建依赖。会话状态、日志 snapshot 不在模块 import 时落盘。

- [ ] 用可监测 getItem/setItem/removeItem 的 StorageAdapter fake 给 History off 注入预先有记录的 logDisk，initialize/add/clear/dispose 全周期断言 logDisk 零调用，preferenceDisk 正常工作；再新建 History on 运行时读到旧记录且没有 off 期间日志。容量测试：

```ts
import { persistedLogLimit } from '../../utils/logRuntime';
test.each([
  ['network', 200, 30], ['console', 200, 50],
  ['native', 10, 10], ['track', 1, 1],
] as const)('%s respects its persistence cap', (feature, maxLogs, expected) => {
  expect(persistedLogLimit(feature, maxLogs)).toBe(expected);
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/utils/logRuntime.test.ts src/__tests__/features/sessionLogStorage.test.ts src/__tests__/features/nativeLogs.test.ts src/__tests__/features/featureLifecycle.test.ts`，预期 History off 隔离和容量测试失败。
- [ ] History off 分配纯内存日志 store/sessionManager；偏好始终使用独立存储。History on 设置四个 persisted key 和容量；State/Navigation 仅内存。保留现有历史与偏好的存储 key/namespace，不因内部容器重构让旧数据失联；需要改变时必须显式迁移并测试。修正 clear/log 保存排序，最新优先、会话数包含当前。
- [ ] 将 collector 统一绑定注入的 runtime；Console 保留原始方法、引用归属，释放后恢复；Native 先检测模块能力，再启动默认 500ms timer，缺模块标 unavailable 且不启动 timer。所有日志入队前固定快照，复用安全序列化边界，不执行业务函数。

```text
算法：持久化错误 → 记录 capability issue → 当前日志切到内存 → History unavailable。
偏好保存失败 → 当前值仍可用，标记未保存；不吞掉为成功持久化。
取消初始化 → 后续磁盘结果丢弃；禁止建立新的 Session 或 timer。
```

- [ ] 补 MMKV 初始化/写失败、native 不存在零 timer、level/tag 过滤、重复挂载无重复 Console、maxLogs 超限、history 清理范围测试；运行本任务测试和 `rtk proxy npm run typecheck`，预期通过。
- [ ] 仅暂存本任务 Files，提交 `feat: separate log persistence from feature preferences`。

## Task 5：通用数据源、State/Navigation/Track

**Files**
- Create: `src/utils/observeSource.ts`, `src/features/state/index.ts`, `src/features/state/StateLogTab.tsx`, `src/adapters/zustand.ts`
- Modify: `src/features/navigation/index.ts`, `src/features/track/index.ts`, `src/types/logs.ts`
- Test: `src/__tests__/utils/observeSource.test.ts`, `src/__tests__/features/state.test.ts`, `src/__tests__/features/navigation.test.ts`, `src/__tests__/adapters/zustand.test.ts`

**Interfaces**

```ts
export function observeSource<T>(source: DebugSource<T>, options: {
  signal: AbortSignal;
  onSnapshot(value: T): void;
  onError(error: unknown): void;
}): () => void;
// adapters/zustand.ts，结构化接口，不 import Zustand 包。
export function zustandAdapter<T>(id: string, store: {
  getState(): T;
  subscribe(listener: (state: T, previousState: T) => void): () => void;
}): StateAdapter<T>;
// 公共动作（实际 facade 在任务 10 实现）
export interface StateEvent { action: string; before: unknown; after: unknown }
export interface NavigationEvent { action: string; from?: string; to: string; state?: unknown }
```

驱动消费 `FeatureContext` 和注入的日志 runtime。State 订阅初值不产生虚构 change，之后变化才记录前后值；无 adapters 的手动通道仍存在。

- [ ] 写 source 正常订阅/取消测试，含“第一次 getSnapshot 后、subscribe 建立前值变了”的竞争场景。测试适配器转发原始 getState/subscribe，并且状态未变时快照稳定。

```ts
import { observeSource } from '../../utils/observeSource';
test('subscription errors are reported without escaping', () => {
  const onError = jest.fn();
  expect(() => observeSource({
    getSnapshot: () => 1,
    subscribe: () => { throw new Error('source failed'); },
  }, { signal: new AbortController().signal, onSnapshot: jest.fn(), onError })).not.toThrow();
  expect(onError).toHaveBeenCalledTimes(1);
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/utils/observeSource.test.ts src/__tests__/features/state.test.ts src/__tests__/features/navigation.test.ts src/__tests__/adapters/zustand.test.ts`，预期新模块测试失败。
- [ ] 实现安全 observer：读取→订阅→再次读取补齐竞争；catch getSnapshot/subscribe/listener，报告错误并释放；unsubscribe 幂等且抛错不阻断其余清理。调用方负责快照结构验证和稳定身份，State 日志负责序列化副本。
- [ ] State 迁移旧 Zustand 展示但公共 key 改 `state`；自动 action 固定 `change`。精确 action 来自手动事件。适配器只转发 store 协议，主包不依赖状态库。
- [ ] Navigation 无 ref 直接 empty，零 timer；有 ref 时仅等待其 current/isReady，最多随本地 10 秒初始化期限等待，取消时清理 timer；ready 后监听 state，用 route key/name 去重，记录观察到的路由而非假定业务 action。同名但 key 不同视为不同路由实例；只有 name 的 ref 按 name 去重。

```text
算法：State 保存已序列化的 before；通知时固定 after → append(action=change) → before=after。
Navigation 获取不到 route 则不伪造记录；已观察路由变化记录 action=change。
Track 仅接受主动事件；关闭/未就绪时不缓冲也不创建 runtime。
```

- [ ] 补零 ref 零 timer、ref 延迟就绪、同名异 key、重复通知、卸载取消、source 返回循环/函数值不执行、入队后业务突变不修改旧日志测试；运行本任务测试通过。
- [ ] 仅暂存本任务 Files，提交 `feat: unify state and navigation data bindings`。

## Task 6：统一环境模型与无配置空态

**Files**
- Modify: `src/types/environment.ts`, `src/features/environment/environmentConfig.ts`, `urlPrefixRewrite.ts`, `index.ts`, `EnvironmentTab.tsx`, `src/core/config.ts`
- Test: `src/__tests__/features/environmentConfig.test.ts`, `environmentRewrite.test.ts`, `environmentFeature.test.ts`, `environmentDisplay.test.ts`

**Interfaces**

```ts
export interface DebugEnvironment { id: string; title: string; urls: Readonly<Record<string, string>> }
export interface EnvironmentOptions {
  enabled?: boolean;
  items?: readonly DebugEnvironment[];
  defaultId?: string;
  onChange?(environment: DebugEnvironment): void | Promise<void>;
}
export function normalizeEnvironment(input: unknown): {
  items: readonly DebugEnvironment[];
  defaultId: string | null;
  issues: readonly ConfigIssue[];
};
```

配置解析与 Task 1 聚合；驱动从 LogRuntimeContext 取 preferenceStorage，从 XHR 服务 acquireRewriter，取消用 FeatureContext。UI 调用 feature 内部 switch 方法，不新增公共 environment controller。

- [ ] 保留现有前缀测试并改新字段；加空列表+已存 prod 的运行时测试：无偏好读取、无 rewriter、onChange 零次、phase empty。基础解析测试：

```ts
import { normalizeEnvironment } from '../../features/environment/environmentConfig';
test('default id without supplied items is a normal empty page', () => {
  expect(normalizeEnvironment({ defaultId: 'dev' })).toEqual({
    items: [], defaultId: null, issues: [],
  });
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/features/environmentConfig.test.ts src/__tests__/features/environmentRewrite.test.ts src/__tests__/features/environmentFeature.test.ts src/__tests__/features/environmentDisplay.test.ts`，预期旧模型不满足新测试。
- [ ] 删除 host 数组/managed 两套输入；解析 id/title/非空 urls，HTTP(S) 绝对 URL、同一服务 key 集合、重复 ID/相同歧义前缀、非法 defaultId 报准确路径。items 为空时不校验 defaultId 命中、不读取恢复值。
- [ ] 保留最长前缀、路径边界算法；注册本轮 rewriter 并在恢复默认时移除自身租约。初始化恢复“仍有效持久化 ID，否则默认”；提供 onChange 时通知有效选择，取消/失败不提交偏好。

```text
算法：切换加 busy → 暂时应用目标前缀 → await onChange(target) → 校验 token。
成功：持久化 ID；失败：恢复 SDK 前缀/选项，展示错误；finally 清 busy。
busy 时拒绝新选择。初始化回调失败退回默认并报告错误。
业务回调自己的外部副作用由业务补偿，SDK 不声称已回滚业务客户端。
```

- [ ] 补 `/api` 与 `/api2`、根路径、尾斜线/query/hash、多服务、非法 URL、无效历史 ID、callback 失败、取消后迟到结果、Network 关闭但环境仍可改写且零日志测试；运行本任务测试通过。
- [ ] 仅暂存本任务 Files，提交 `feat: support empty and unified environment configuration`。

## Task 7：账号可选输入、原子快照与串行切换

**Files**
- Modify: `src/features/quickAccounts/types.ts`, `controller.ts`, `createQuickAccountsFeature.ts`, `storage.ts`, `QuickAccountsTab.tsx`, `index.ts`, `src/types/config.ts`, `src/types/debug.ts`, `src/core/config.ts`
- Test: `src/__tests__/features/quickAccountsController.test.ts`, `quickAccountsFeature.test.ts`

**Interfaces**

```ts
export type AccountSwitchResult =
  | { status: 'success' | 'superseded' | 'disabled' | 'busy' | 'not_configured' | 'not_found' }
  | { status: 'error'; error: unknown };
export interface AccountsActions {
  switchTo(id: string): Promise<AccountSwitchResult>;
  suspend(): void;
  resume(): void;
  waitForIdle(): Promise<void>;
}
// DebugAccount/AccountsSnapshot/AccountsData 使用设计 §4.4 的完整合同。
// 回调中的 account 始终是 A 原始对象，绝不转换成仅含展示字段的 ViewItem。
```

- [ ] 先更新现有 controller 测试字段 label→title；增加 `items: []`、只有 items、只有 callback 的测试。函数名维持内部 `createQuickAccountsFeature`，其参数改为公共 AccountsOptions 和单独 runtime context；返回内部 feature 及 AccountsActions，不再要求必填 onSwitch。

```text
测试序列：items=[a]、无 onSwitch → switchTo(a) = not_configured；无 items → not_found。
两种结果均不写最近 ID，不调用成功回调，不关闭面板。
存储已有 a 而当前 items=[] → 空页，不恢复认证，不创建虚构账号。
```

- [ ] 在现有 controller 测试中加入以下串行断言；内部 controller 方法继续接受原始 account 对象，feature facade 才接受 ID。补齐上述空供给断言到现有 feature harness。

```ts
import { createQuickAccountsController } from '../../features/quickAccounts/controller';
test('busy switch does not start a second login', async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const onSwitch = jest.fn(() => pending);
  const controller = createQuickAccountsController({ onSwitch });
  const first = controller.switchTo({ id: 'a', title: 'A' });
  await Promise.resolve();
  await expect(controller.switchTo({ id: 'b', title: 'B' }))
    .resolves.toEqual({ status: 'busy' });
  expect(onSwitch).toHaveBeenCalledTimes(1);
  finish();
  await expect(first).resolves.toEqual({ status: 'success' });
  await controller.waitForIdle();
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/features/quickAccountsController.test.ts src/__tests__/features/quickAccountsFeature.test.ts`，预期旧必填回调/取消逻辑失败。
- [ ] 接入静态 partial 或动态完整 source 的 XOR；动态快照逐次验证 items/id/title/唯一 ID，非法快照标 error、取消操作并释放 source；认证未知保持三态，不把 undefined 转 false。未传 currentDetails 不遍历账号扩展字段；持久化只存最近 ID。
- [ ] 修改 generation：只针对 scope 改变、目标移除/对象替换、source 释放、suspend/unmount；currentId/details/isAuthenticated/contextLabel 更新仅更新 UI。输入相同源通知不新建账号对象，避免身份误判。

```text
算法：switchTo 先判断 disabled/suspended → busy → 目标是否存在 → callback 是否存在。
记录 {token, scope, targetObject}，await onSwitch(target,{signal})。
成功提交前重新核对三者；过期则 await onRollback(reason=superseded)，不写 ID/通知成功。
失败则 await onRollback(reason=error)，收敛 onError 的异常；finally 清理并唤醒 idle 等待者。
成功提交后 onSuccess 抛错只作为通知错误，不再回滚已成功登录。
等待中的切换或补偿不结束，busy/waitForIdle 就不能提前结束；resume 也不能绕开忙碌。
```

- [ ] 用延迟 Promise 固定以下事件序列，逐条断言回调/持久化/关闭次数：

```text
A. switch(a) → source 更新 isAuthenticated/currentId → resolve login：success，未 abort。
B. switch(a) → 同 ID 替换 a 对象 → resolve login：superseded，rollback 一次，无最近 ID。
C. switch(a) → scope 改变 → callback 忽略 signal：新 switch 返回 busy，waitForIdle 未完成。
D. C 的 login 与 rollback 均结束 → waitForIdle 才完成；旧结果不能污染新 scope。
E. onSuccess 抛错：登录保持成功，通知错误可见，rollback 零次。
F. onRollback/onError 自身抛错：可见错误，不递归回调；最终清理一次。
```

- [ ] 运行本任务测试与 `rtk proxy npm run typecheck:api`，预期全通过，包括 `onSwitch` 从 items/source 推断业务扩展字段。仅暂存本任务 Files，提交 `feat: simplify account configuration and preserve switch safety`。

## Task 8：固定 Custom 页与真实文本传递结果

**Files**
- Create: `src/features/tabs/index.tsx`, `src/features/tabs/TabsTab.tsx`
- Modify: `src/features/clipboard/index.ts`, `ClipboardTab.tsx`, `src/utils/copyToComputer.ts`, `src/types/config.ts`, `src/types/debug.ts`, `src/core/config.ts`
- Test: `src/__tests__/utils/copyToComputer.test.ts`, `Demo/__tests__/TabsTab.test.tsx`, `src/__tests__/features/tabsConfig.test.ts`

**Interfaces**

```ts
export type DeliveryStatus = 'success' | 'unavailable' | 'disabled' | 'error';
export interface CopyResult {
  status: 'completed' | 'disabled';
  phone: { status: DeliveryStatus; reason?: string };
  console: { status: DeliveryStatus; reason?: string };
  hub: { status: DeliveryStatus; reason?: string };
}
export interface CopyChannels {
  copyPhone?: (text: string) => void | Promise<void>;
  recordConsole?: (text: string, label?: string) => void;
  sendHub?: (text: string, label?: string) => Promise<'delivered' | 'unavailable'>;
}
export function copyToComputer(text: string, options: {
  label?: string; enabled: boolean; channels: CopyChannels;
}): Promise<CopyResult>;
```

公共 facade 隐藏 channels，只收 `text, { label }`。Hub success 必须代表协议已有的可确认交付；若当前协议仅发送无确认，映射 unavailable/reason 说明未确认，不能把 socket open 当作电脑已收到，也不扩展新协议。

- [ ] 写 enabled=false 零通道调用、没有 Console 不写日志、没有 Connect 不发送、缺手机剪贴板但 Console 可用测试；加入下述分通道断言。

```ts
import { copyToComputer } from '../../utils/copyToComputer';
test('missing hub does not claim computer delivery', async () => {
  const recordConsole = jest.fn();
  const result = await copyToComputer('hello', { enabled: true, channels: { recordConsole } });
  expect(recordConsole).toHaveBeenCalledTimes(1);
  expect(result.console.status).toBe('success');
  expect(result.hub.status).toBe('unavailable');
  expect(result.phone.status).toBe('unavailable');
});
```

- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/utils/copyToComputer.test.ts src/__tests__/features/tabsConfig.test.ts`，预期旧 helper 返回合同不符；Demo 新测首次运行预期缺模块。
- [ ] 文本动作直接调用显式通道、不借 monkey-patched console 猜测采集结果；通道逐项隔离异常，只在用户操作时执行。
- [ ] Tabs 永远只有一个父入口；items 为空显示正常提示。有 source 的组件用安全订阅和 `{ snapshot }`，无 source 的组件不注入虚构业务 Context；inactive component 卸载遵循 React，onActivate/onDeactivate 只按功能 runtime 生命周期各一次。

```text
算法：解析 items → 排除显式 disabled 项 → 检查 ID 与内置 ID/彼此冲突。
功能 start：逐个建立 source/运行 onActivate；失败项单独显示原因，其余项可用。
功能 dispose：取消源、调用 onDeactivate；不因用户每次选中 Tab 重复注册。
onClear/badge 抛错显示该项错误，不影响 App；badge 仅用于展示。
```

- [ ] Demo renderer 测试逐个断言空页、混合组件、source 更新、订阅取消、生命周期次数、组件抛错的错误边界、Context→source 桥接；执行 `rtk proxy npm --prefix Demo test -- --runInBand TabsTab.test.tsx` 及本任务根测试应通过。
- [ ] 仅暂存本任务 Files，提交 `feat: keep custom tabs visible and report copy channels accurately`。

## Task 9：Connect 自动识别与明确的地址优先级

**Files**
- Modify: `src/features/devConnect/index.ts`, `types.ts`, `nativeDevConnect.ts`, `resolveAndApplyHubEndpoint.ts`, `DevConnectTabV4.tsx`, `hubAddressRecommendations.ts`, `src/utils/HubEndpointResolver.ts`, `HubClient.ts`
- Test: `src/__tests__/utils/HubEndpointResolver.test.ts`, `HubClient.test.ts`, `src/__tests__/features/devConnectV4Feature.test.ts`, `nativeDevConnect.test.ts`, `Demo/__tests__/DevConnectTabV4.test.tsx`

**Interfaces**

```ts
export function resolveAppId(explicit: string | undefined, nativeApplicationId: string | undefined): string | null;
export function selectEndpoint(input: {
  manual?: string; configured?: string; automatic?: string;
}): { endpoint: string; origin: 'manual' | 'configured' | 'automatic' } | null;
```

这两个纯函数放到现有 resolver/nativeDevConnect 模块；真实连接沿用 HubClient 协议和 native getAppInfo，Native 返回值类型不改名。驱动 signal 控制发现/retry/upload 生命周期。

- [ ] 写 endpoint 优先级矩阵、显式失败不 fallback、无原生 appId 不造占位值、Release 显式启用也不自动 discover/upload 测试。纯函数示例：

```ts
import { selectEndpoint } from '../../utils/HubEndpointResolver';
test('configured endpoint precedes auto discovery', () => {
  expect(selectEndpoint({ configured: 'http://10.0.0.2:8098', automatic: 'http://127.0.0.1:8098' }))
    .toEqual({ endpoint: 'http://10.0.0.2:8098', origin: 'configured' });
});
```

示例端口仅验证优先级，不修改现有 Hub 默认端口。
- [ ] 运行 `rtk proxy npm test -- --runInBand src/__tests__/utils/HubEndpointResolver.test.ts src/__tests__/utils/HubClient.test.ts src/__tests__/features/devConnectV4Feature.test.ts src/__tests__/features/nativeDevConnect.test.ts`，预期新优先级测试失败。
- [ ] 先决定地址来源，再尝试连接；手动或配置地址失败只显示其失败，清除手动后再回到配置/自动。无 appId 标 unavailable，其他页面工作；原生 info 异步结果提交前检查 token。
- [ ] Debug 自动复用既有 Metro/平台候选和 `/ready` 协议/名称检查；单次探测现有 800ms 超时，取消 fetch/timer、有限退避重试，不进入本地 ready 等待。Release 不运行自动任务，Upload Once/Start Live Logs 必须用户触发。

```text
算法：start → 解析 appId → 发布本地 Connect 状态 → 本地 start 完成。
若 Debug 且无显式地址，后台发现；发现失败退避。显式地址仅尝试该地址。
任何重连/探测响应：检查 owner 和 signal 后才能更新 endpoint/uploader。
dispose：abort 探测、清 retry、停止本 owner 的 uploader、移除 provider 订阅。
```

- [ ] 补 Hub 未启动/后启动/断开/重连、卸载期间完成响应、关闭 Connect 零残留 timer/request、手动错误地址不串 Hub、当前 App/Session 标识测试；根测试和 Demo `DevConnectTabV4.test.tsx` 应通过。
- [ ] 仅暂存本任务 Files，提交 `feat: resolve connect identity and endpoints without required config`。

## Task 10：组装全部功能、唯一 HOC 与公共动作

**Files**
- Create: `src/core/createFeatureDrivers.ts`, `src/core/debug.ts`, `src/withDebugToolkit.tsx`, `src/ui/panel/FeatureStatusView.tsx`
- Modify: `src/core/DebugToolkit.tsx`, `DebugToolkitProvider.tsx`, `src/index.ts`, `src/types/index.ts`, `src/ui/panel/DebugPanel.tsx`, `FeatureRail.tsx`, `buildFeatureSummary.ts`, `tabPersistence.ts`, `filterFeatureSnapshot.ts`, `panelFilterState.ts`, `FeatureIntroCard.tsx`, `src/i18n/locales/en.json`, `zh-CN.json`, `src/utils/deviceReport.ts`, `type-tests/integration.tsx`
- Remove: `src/core/initialize.ts`, `src/ui/DebugView.tsx`, `src/features/quickAccounts/useQuickAccountsFeature.ts`, `src/features/navigation/useNavigationLogger.ts`, `src/utils/createDebugTab.ts`, `src/features/thirdPartyLibs/`, `src/features/zustand/`（State 展示迁移完成后）
- Test: `src/__tests__/core/debug.test.ts`, `src/__tests__/core/DebugToolkit.test.ts`, `Demo/__tests__/withDebugToolkit.test.tsx`, `Demo/__tests__/DefaultFeaturePages.test.tsx`
- Migrate/remove replaced tests: `src/__tests__/core/initialize.test.ts`, `src/__tests__/features/quickAccountsHook.test.ts`, `src/__tests__/utils/createDebugTab.test.ts`；其仍有效的生命周期/行为断言迁移到新测试，不能直接删除覆盖。

**Interfaces**

```ts
export interface DebugReport {
  status: ReadyResult['status'];
  features: Partial<Record<FeatureKey, FeatureStatus>>;
  logs: Partial<Record<LogFeatureKey, readonly unknown[]>>;
  appId?: string;
  sessionId?: string;
}
export interface DebugActions {
  ready(): Promise<ReadyResult>;
  open(): void;
  close(): void;
  clear(feature?: LogFeatureKey): void;
  track(name: string, data?: unknown): void;
  state(id: string, event: StateEvent): void;
  navigation(event: NavigationEvent): void;
  copyToComputer(text: string, options?: { label?: string }): Promise<CopyResult>;
  getReport(): DebugReport;
  accounts: AccountsActions;
}
export const debug: DebugActions;
export function withDebugToolkit<
  P extends object, A extends DebugAccount = DebugAccount,
  S extends readonly unknown[] = readonly never[],
>(App: React.ComponentType<P>, config?: DebugToolkitConfig<A, S>): React.ComponentType<P>;
```

`ReadyResult/DebugReport/CopyResult/AccountsActions` 定义于公共 `types/debug.ts`，runtimeTypes 仅 import/re-export，避免出现两个相似定义。`createFeatureDrivers.ts` 的接口为 `createFeatureDrivers(services: { logs: LogRuntimeContext; debugBuild: boolean; panel: { open(): void; close(): void } }): RuntimeDependencies['createDriver']`，产生 Task 2 的 RuntimeDependencies.createDriver；通过闭包持有本轮 LogRuntimeContext 与功能实例，绝不回退到全局默认 runtime。

页面合同继续沿用内部 `DebugFeature`：加只读 `status: FeatureStatus`，snapshot 结构仍由各页负责。不要把功能 snapshot 强制变成同一个大联合，Hub 由映射适配其现有协议。

- [ ] 在 Demo renderer 添加 HOC 默认十二页及 props 透传测试。测试 native build mock 明确设 Debug，不用 `enabled: true` 偷换零配置用例。源码主入口只在本任务末接线；先从新文件导入。

```tsx
import React from 'react';
import { act, create } from 'react-test-renderer';
import { withDebugToolkit } from '../../src/withDebugToolkit';
import { debug } from '../../src/core/debug';
import { FEATURE_KEYS } from '../../src/core/featureCatalog';
test('one wrapper registers the full toolkit and preserves app props', async () => {
  const App = jest.fn((_props: { title: string }) => null);
  const Wrapped = withDebugToolkit(App);
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(<Wrapped title="shop" />); });
  await act(async () => { await debug.ready(); });
  expect(App.mock.calls[0]?.[0]).toEqual({ title: 'shop' });
  expect(Object.keys(debug.getReport().features).sort()).toEqual([...FEATURE_KEYS].sort());
  await act(async () => { tree.unmount(); });
});
```

- [ ] 运行 `rtk proxy npm --prefix Demo test -- --runInBand withDebugToolkit.test.tsx DefaultFeaturePages.test.tsx`，预期缺新入口/默认页失败。
- [ ] HOC 在模块作用域闭包保存固定 config，在 useLayoutEffect 内建立本次 runtime、claimHost 并同步暴露 ready，再调用 start；cleanup 先 dispose 再 release。渲染内部 Provider 与原 App，透传 props，提供 displayName。不要在 render 中创建运行时或执行 native/storage 调用。显式 enabled:true 仍需确定构建模式供 Connect 使用；构建模式未知时允许本地 opt-in，但禁止自动发现/上传。

```text
算法：模块调用 HOC → 创建组件定义（无 runtime 副作用）。
挂载 layout effect → 创建 runtime/ready → claim 单宿主 → start 异步门禁。
子组件普通 useEffect 可 await 同一 ready；不承诺其 layout effect/模块代码被捕获。
重复宿主：新宿主报告 duplicate_host 并停用自身，原宿主继续；错误不抛出打断 App。
StrictMode 探测卸载：旧 ready cancelled，旧 lease 释放，再建新 owner。
Fast Refresh：释放旧驱动和监听；重建后一个 collector、一套页面。
```

- [ ] 聚合十二个 driver，先建页面后装行为；每个 enabled+合法驱动独立 start/dispose。FeatureStatusView 统一 empty/unavailable/error，真实错误显示路径，空页提供补数据说明；onSwitch 缺失只禁用切换。组件渲染异常由局部 ErrorBoundary 兜住。
- [ ] debug facade 只查询当前宿主，不初始化 storage/channel。未就绪的记录动作 no-op；clear 仅六类当前日志，不能触发环境 clear/偏好/history 删除。getReport 在 disabled 仅返回状态和空集合，不触发 native 信息采集。accounts 无有效驱动时返回 disabled；ready 未挂载返回 not_started。
- [ ] 更新 key 映射和 i18n：`state/connect/history/accounts/tabs` 是公开与面板名称；如 Hub 协议仍用 `zustand/devConnect/sessionHistory`，只在传输适配处映射。不再有 thirdPartyLibs/FLEX/DoKit 悬空 UI。
- [ ] 切换 `src/index.ts` 到仅公开 HOC/debug/相关类型；移除旧 default/factory/Provider/hook/controller/format/storage exports。保留与接入无关的 Hub CLI 功能，不误删现有运行时诊断命令。按 Remove 列表处理旧代码，迁移旧测试的有效断言。
- [ ] 将 type-tests 改从 `../src` 导入，加入旧 API 的 `@ts-expect-error`；补普通 child effect 等 ready、StrictMode、Fast Refresh、双宿主、超时重挂、全局 false 零副作用、单功能错误十一项继续、每个空页能真实打开的测试。运行：

```bash
rtk proxy npm test -- --runInBand
rtk proxy npm --prefix Demo test -- --runInBand
rtk proxy npm run typecheck
rtk proxy npm run typecheck:api
```

预期全部通过；旧 Demo 接入在本任务改到可编译的 HOC 基础形态，任务 11 再完善业务场景，不能留下测试全红的提交。需要修改 `Demo/App.tsx` 时只做入口替换，记录给任务 11。
- [ ] 仅暂存本任务实际变更文件，提交 `feat!: expose one root integration and unified debug actions`。

## Task 11：Demo 的零业务配置与完整 Showcase

**Files**
- Create: `Demo/ZeroConfigApp.tsx`, `Demo/debug.config.tsx`
- Modify: `Demo/App.tsx`, `Demo/Showcase.tsx`, `Demo/demoApi.ts`, `Demo/index.js`, `Demo/README.md`, `Demo/__tests__/App.test.tsx`, `Showcase.test.tsx`, `Demo/package.json`，以及复现 lint 问题所需的 Demo ESLint 配置/锁文件
- Test: `Demo/__tests__/ZeroConfigApp.test.tsx`, `Demo/__tests__/DefaultFeaturePages.test.tsx`, `Demo/server/api.test.cjs`

**Interfaces**

```tsx
// ZeroConfigApp.tsx，默认导出必须只有这一种接入形态。
import React from 'react';
import { Button, View } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';
let eventCounter = 0;
function ZeroConfigApp() {
  return <View><Button title="生成标记日志" onPress={() => {
    console.log(`integration-${Date.now()}-${++eventCounter}`);
  }} /></View>;
}
export default withDebugToolkit(ZeroConfigApp);
```

零配置页面业务 UI 实际包含“生成标记日志”和“发送测试请求”，HTTP 地址由 Demo API 环境约定提供，不能通过 Toolkit 环境列表冒充零业务配置。完整 Showcase 配置用独立文件，购物状态经 DebugSource 桥接。

- [ ] ZeroConfigApp 测试确认 HOC 只收到 App 一个参数，无 appId/endpoint/ref/adapter 填充；渲染后逐页打开十二类。为每次事件生成 `integration-${Date.now()}-${counter}` 标记，网络请求把相同标记放 query 或 body。
- [ ] 运行 `rtk proxy npm --prefix Demo test -- --runInBand ZeroConfigApp.test.tsx Showcase.test.tsx`，预期新场景/旧调用不匹配失败。
- [ ] Showcase 一次根包装；删除手动 initialize/provider/controller/hook。debug.config 定义真实 environment/items/onChange、accounts source/onSwitch、state adapter、navigation ref（若场景未使用真实导航则用明确手动事件）、track 和自定义组件，不创建假来源数据。

```text
算法：Demo 入口选择 ZeroConfigApp 或 ShowcaseApp（二者模块作用域各自定义，运行只挂一个）。
ZeroConfig 仅正常业务按钮触发 console 和真实 HTTP，不配置 Toolkit 数据。
Showcase 通过现有购物 API 触发 409 → 环境切换 → 再请求返回 201；状态和 track 同步更新。
账号/环境切换等待 debug.ready；自定义购物组件通过外部 store source 读取业务数据。
```

- [ ] 修改现有 Showcase renderer 测试：409 仍可复现，环境回调后真实依赖更新再为 201，账户展示反馈不取消成功操作，copy 返回实际通道状态。API 测试保持真实 HTTP 逻辑，不把状态码写死为成功。
- [ ] 复现已知 lint 工具错误，读取实际堆栈和已安装依赖版本后修复配置/版本配对；不全局 disable ESLint、不改不相关业务代码。运行：

```bash
rtk proxy npm --prefix Demo test -- --runInBand
rtk proxy npm --prefix Demo run test:api
rtk proxy npm --prefix Demo exec -- tsc --noEmit -p tsconfig.json
rtk proxy npm --prefix Demo run lint
```

预期各项通过；`npm exec` 的 cwd 由执行环境确认，必要时工具 workdir 显式设 Demo 并执行 `rtk proxy npx tsc --noEmit`，避免误跑根 tsconfig。
- [ ] 仅暂存本任务 Files，提交 `feat(demo): verify full toolkit with empty and complete business data`。

## Task 12：包出口、原生依赖与干净消费者

**Files**
- Create: `scripts/verify-package.mjs`, `scripts/consumer-fixture.mjs`, `scripts/__tests__/verify-package.test.mjs`
- Modify: `package.json`, `package-lock.json`, `react-native-debug-toolkit.podspec`, `android/build.gradle`（仅依赖验证确实需要时）
- Modify: `Demo/package.json`, `Demo/package-lock.json`, `Demo/metro.config.js`, `Demo/tsconfig.json`, `Demo/ios/Podfile`, `Demo/ios/Podfile.lock`, `Demo/android/settings.gradle`, `Demo/android/app/build.gradle`, `Demo/react-native.config.js`

**Interfaces**

```text
node scripts/verify-package.mjs --tarball <absolute.tgz>
  检查解包 manifest 与实际文件，缺失或外部依赖泄漏 exit 1。
node scripts/consumer-fixture.mjs --tarball <absolute.tgz> --out <absolute-dir> --mode blank|integrated
  输出独立 RN CLI App；blank 不修改根组件，integrated 应用已公开 HOC 示例。
  out 必须在 repo 外且尚不存在；不覆盖用户目录。成功打印绝对路径与 manifest。
```

- [ ] 给 verify-package 添加 Node 内置 test：有效 fixture manifest 通过，缺 types/native 文件失败，主入口包含可选 Zustand import 失败，README/docs 未打包失败。用 `node:test` + `assert.rejects`，输入为测试创建的临时 tarball，测试结束仅清自己的 temp 目录。
- [ ] 运行 `rtk proxy node --test scripts/__tests__/verify-package.test.mjs`，预期缺脚本失败。
- [ ] 先构建 Bob，检查真实输出路径，再配置 package exports 的 `.`、`./adapters/zustand`、`./package.json`；每项 types/commonjs/module/react-native 条件指向实际文件。子路径源码 `src/adapters/zustand.ts`，构建类型路径按 Bob 产物验证，不猜输出。旧内部路径禁止作为新公开 API。主入口源码/构建产物均不静态导入可选业务状态库。
- [ ] manifest/files 加入中英 README 与公开 integration/configuration/examples，排除 blog、测试和内部 plans/specs。主版本调整到 5.0.0 开发交付版本并同步 root lock/podspec 的来源版本，不执行 publish。若执行时仓库已越过该版本，先核对当时版本再选择下一个主版本，不回退版本。
- [ ] 读取实际安装的 MMKV/Nitro metadata 和原生要求，核实 RN 下限/架构/平台限制；更新依赖及支持表到有构建证据的范围。不要只沿用当前 `>=0.72.0`。现有 RN 0.85.1 Demo 是上端样例，并不证明无限新版本兼容。
- [ ] Demo 使用声明的 toolkit 包依赖和常规 autolinking；去掉 Metro toolkit 源码别名、TS paths 及 iOS/Android 父目录直连。日常 Demo 使用 `"react-native-debug-toolkit": "file:.."` 声明并用 npm 安装，fixture 生成时必须替换为 tarball 安装；开发 Metro 可以统一 React 实例解析，但不能直接把 toolkit 包映射到 `../src/index.ts`。禁止提交绝对机器路径或 tarball 二进制。锁文件重新生成并检查依赖差异；现有 root pnpm/yarn 和 Demo pnpm 锁不静默删除，明确支持的 npm 流程与其他锁文件状态；有维护约定则同步，不把旧锁描述成已验证。
- [ ] 实现消费者脚本：把 Demo 原生 App 壳复制到 repo 外，过滤 node_modules/build/Pods/本地环境文件；复制后校验零父目录依赖，按锁定 RN CLI 模板/版本和包 tarball 安装。`blank` 模式使用未接入的 RN App；`integrated` 模式只按公开示例包装。可以复用业务组件，不能复用已接好 HOC 的入口给 AI 测试。

```js
// 路径检查的核心，实际脚本使用 fs.mkdtemp/os.tmpdir 或调用方 out。
import path from 'node:path';
export function assertOutsideRepository(repo, output) {
  const relative = path.relative(path.resolve(repo), path.resolve(output));
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('consumer fixture must be outside the repository');
  }
}
```

- [ ] build → pack 到临时目录 → verify-package → integrated consumer 安装/typecheck。pack 用 `npm pack --json --pack-destination <临时目录>` 获取确切 tgz，不能手写猜文件名；脚本用 spawn 参数数组，无 shell 插值。运行消费者的 `react-native config`，检查 autolinking 路径均来自其 node_modules。`require.resolve` 从消费者 cwd 执行，禁止 NODE_PATH 补齐。
- [ ] 执行 `rtk proxy npm run build`、本任务 Node test、API typecheck；真实 iOS/Android 构建留任务 14，静态结果不能写成原生安装通过。仅暂存本任务 Files，提交 `build: validate packaged integration in isolated consumers`。

## Task 13：人和 AI 共用的公开文档

**Files**
- Create: `docs/integration.md`, `docs/integration.zh-CN.md`, `docs/configuration.md`, `docs/configuration.zh-CN.md`
- Create: `docs/examples/integration/App.tsx`, `debug.config.tsx`, `source.ts`, `tsconfig.json`, `scripts/check-doc-config.mjs`
- Modify: `README.md`, `README.zh-CN.md`, `docs/setup.md`, `docs/setup.zh-CN.md`, `docs/usage.md`, `docs/usage.zh-CN.md`, `Demo/README.md`, `package.json`
- Test: 文档示例 tsc；配置字段一致性检查；最终 tarball 文档校验

**Interfaces**

```text
npm run typecheck:docs → tsc -p docs/examples/integration/tsconfig.json
npm run check:docs → node scripts/check-doc-config.mjs
```

文档字段表采用稳定的 `feature.field` 标识；检查脚本从配置解析器维护的允许字段/默认值定义生成对照，而不是手写另一份功能清单。业务深层字段、source XOR、回调语义仍由文档与类型例子明确，不将复杂行为压缩成 schema 自动文案。

- [ ] 先写完整示例：一个可直接运行的 App、一个带 items/onSwitch 的账号配置、一个外部 store/source 与自定义组件，所有变量和 import 都定义。示例统一从包名导入；类型检查可以映射到构建 types，但消费者最终必须解析真实包。

```tsx
import React from 'react';
import { Text } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';
function App() { return <Text>My App</Text>; }
export default withDebugToolkit(App);
```

- [ ] 运行文档 typecheck 和字段检查，预期未覆盖全部 feature/未建脚本时失败。
- [ ] 写 integration 单页指南：识别既有根注册/HOC→安装准确包名和原生依赖→修改前后完整入口→原生重编译→启动既有 Hub CLI→生成带唯一标记的真实事件→核对当前 App/Session。已有接入先更新原包装，不能追加第二个。
- [ ] 写 configuration 全字段表：每个 feature 的省略/空对象行为、默认值、补数据后的动作、错误条件、显式关闭。覆盖所有高级账号回调、导航 ref 协议、source 稳定引用/取消、Tab Context 桥接、历史磁盘容量、clear 范围、copy 分通道结果。

```text
文档示例算法：外部 store 保存稳定 snapshot；set 更新 snapshot 后通知 listeners。
Tab 接收 snapshot 展示；App 内 Provider 的业务代码更新该 store。
不在 Overlay 再创建 AuthProvider，也不声称 Tab 自动共享 App 内 Context。
```

- [ ] README 一行完整接入先讲清“装包/原生构建仍需要”，不把零配置描述为精简版。旧 setup/usage 页面更新到新 API 或提供明确导航，保持 Hub CLI 内容；清理所有面向当前版本的旧 API 推荐。支持表仅列已验证 RN CLI；Expo Go 不支持，其他未验证入口不写猜测步骤。
- [ ] 中英文对齐 default/empty/error/disabled、Release 自动行为、ready 捕获边界与等待方式；文档不要求安装接入 Skill，也不要求 AI 阅读内部实现。高级开关放参数参考，不在常规示例列十二个 enabled:true。
- [ ] 执行 `rtk proxy npm run typecheck:docs`、`rtk proxy npm run check:docs`、`rtk proxy npm run build` 后重新 pack/verify-package；所有公开示例可编译，字段/默认值与实现一致。仅暂存本任务 Files，提交 `docs: make full app integration self contained for humans and AI`。

## Task 14：原生、Release、当前会话与文档接入验收

**Files**
- Create: `docs/validation/unified-integration.md`
- Modify: 仅验证暴露的所属实现/测试/文档；每次修复回到对应任务的测试闭环

**Interfaces / 证据格式**

```text
case | package version + tarball hash | RN/React/platform/build mode
appId | sessionId | build identity | marker | commands | actual result | evidence path
status = passed / failed / not_run
```

证据禁止使用历史会话冒充本次事件。保留执行命令和摘要，不把测试账号敏感字段或完整本机环境写入报告。设备/构建环境不可用时标 not_run，明确阻塞；不计为成功，不捏造日志。

- [ ] 创建验证报告，先列全部必测用例为未运行（status=not_run），并从以下执行矩阵逐项填实际证据。
- [ ] 在任务 12 的 repo 外消费者执行 iOS Debug 原生构建与运行（shell 命令在工具调用中加 `rtk proxy`）：在消费者 `ios` 目录安装 Pods，使用其实际 workspace/scheme 和现有可用 simulator；示例构建命令 `xcodebuild -workspace Demo.xcworkspace -scheme Demo -configuration Debug -sdk iphonesimulator -derivedDataPath <该fixture临时build目录> build`。workspace/scheme 必须先由生成工程核实。不得靠父目录 Pods 路径使构建通过。
- [ ] Android 消费者在其 android 工作目录运行 `rtk proxy ./gradlew :app:assembleDebug`，安装到实际可用设备/模拟器，打开十二类页面并生成 marker Console/HTTP。iOS 同样做运行验证；单有 `.app/.apk` 构建产物不标记面板测试通过。
- [ ] 对声明的最低 RN 版本重复 clean install/autolinking/iOS+Android 构建；不兼容时修正 package 支持下限、文档、相应锁定 fixture，重新验证该下限。记录 MMKV/Nitro 的实际版本/架构要求。Demo RN 0.85.1 单列。
- [ ] Release 默认关闭运行：检查无面板、collector/timer/source/storage 初始化、Hub 探测/上传。Release `enabled:true` 运行：本地页可用，无自动发现/上传，只有手动操作才发送。开发 HTTP/ATS/cleartext 例外仅在 Debug 使用，不为通过验证扩散到生产配置。
- [ ] 零业务配置逐项打开十二页，验证 Console/Network 真实采集，Environment/Accounts/State/Navigation/Track/Custom 的空态与动作提示正确；无系统 Clipboard/Native 能力时显示实际 unavailable。打开 Hub 后核对 marker、App/session/build 身份，Hub `/ready` 本身不是通过证据。
- [ ] Showcase 真实运行 409 → 切换环境 → 201，核对 state/track/nav/copy 对应记录；history off 重启不写日志但保留偏好，history on 再启动恢复旧历史；挂卸、Fast Refresh 后事件仍只一条。
- [ ] 文档接入验收独立执行：用脚本生成另一个 `--mode blank` 消费者，给独立 AI 工作上下文只提供该目录、打包后的公开文档与以下任务；不提供本计划/内部源码说明/已接好入口，不加载接入 Skill。此处独立 AI 是验收对象，属于设计明确要求的隔离接入试验。

```text
请依据所提供版本的公开文档，为这个 React Native App 接入 react-native-debug-toolkit。
保留业务入口，使用默认完整工具箱；不要为了消除空态虚构业务数据。
完成安装和原生构建，打开全部功能页，生成带本次唯一标记的 Console 和真实 HTTP 事件。
核对当前 App、Session 和构建身份，保存补丁、执行命令、结果与不能完成的步骤。
完成后再次根据同一文档检查并更新接入，确保幂等，不插入第二个 Toolkit 宿主。
```

- [ ] 收集 AI 补丁/命令/阻塞和当前事件证据；失败归因到文档/API/环境。文档或 API 修复后用新 blank fixture 重试，不能只把已接好结果交回证明成功。模型选择沿用执行时明确的用户/项目策略，不在脚本内硬编码服务或上传私有源码。
- [ ] 最终运行根 tests/typecheck/API 类型、Demo tests/API/lint、docs checks、build/package checks；只对失败或新改动重复扩展测试。报告每项真实结果，不把“未运行”折成全绿。
- [ ] 仅暂存验证报告及已验证的必要修复，提交 `test: record packaged and document-only integration validation`。交付包含代码差异、文档入口、Demo 启动方式、支持范围和剩余环境阻塞；本任务不包含发布、部署或重写 Hub。

## 完成标准与覆盖索引

| 设计要求 | 实施任务 | 必需证据 |
| --- | --- | --- |
| 一行完整接入、十二页、无配置正常空态 | 1、2、10、11、14 | 类型矩阵、renderer 逐页、设备逐页 |
| 所有 feature 对象配置、未知字段与泛型 | 1、6、7、8、10、13 | 正反类型例子、带路径错误、字段文档检查 |
| 生命周期、单宿主、ready、超时、Release 门禁 | 2、9、10、14 | 延迟 Promise/fake timers/StrictMode/设备 |
| XHR 共用、空环境、回滚与恢复 | 3、6 | owner 组合、URL 边界、旧偏好与取消 |
| 日志/History/存储能力失败 | 4、14 | 磁盘零操作、容量、跨初始化恢复 |
| State/Navigation/Track 与 optional adapter | 5、10、12 | 真实 source/ref、快照固定、打包边界 |
| 账号可选输入、source、取消与补偿 | 7、11 | 六组事件时序、类型推断、真实业务 |
| Custom/Context/Clipboard | 8、11、13 | renderer、source 桥接、分通道结果 |
| 自动 App 标识/地址/Hub 重连 | 9、14 | 优先级矩阵、取消、当前 App/Session |
| 旧 API/不可达第三方入口移除 | 10、12、13 | 出口类型负例、包出口、公开文档搜索 |
| 原生真实依赖、版本边界、消费者 | 12、14 | 独立安装/autolinking/双平台构建 |
| AI 公开文档接入 | 13、14 | 无私有提示的 blank fixture 补丁和运行证据 |

实施交付的通过条件是上述必需证据齐全。仅完成类型、源码 Demo 或文档不代表接入体验已验收完成。若本机缺少执行条件，保留明确的未完成项与可复现命令；不要改低标准来宣布完成。

## 计划自检记录

- 已按设计全部章节建立上方覆盖索引，十二项配置、空态、副作用、错误、取消和消费者验收均有归属任务。
- 已核对现有文件路径、根/Demo 测试环境与关键函数合同；新增文件在任务中明确标为 Create。
- 已统一 ready 超时为 `initialization_timeout`，整轮 token 失效；正常空态不进入失败或无限等待。
- 五项 Review Focus 均已绑定具体事件序列或安装验证，未将 Demo 构建当作消费者或 AI 验收。
- 本次产物只有设计状态更新和实施计划；以上复选框均未执行，不表示产品代码或测试已经完成。
