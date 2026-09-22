# 默认完整接入与统一 Feature 配置设计

- 日期：2026-09-22
- 状态：已按默认完整接入方向修订；完整设计稿待审阅，尚未实现
- 范围：SDK 公开 API、初始化与生命周期、全部现有对外功能、接入文档、Demo 与消费者验收
- 发布方式：破坏性变更，以新的主版本发布；不保留旧 API、字段别名和兼容初始化路径

## 1. 用户目标与已确认约束

1. 常见 App 安装依赖并完成原生构建后，只需一行根组件包装即可显示完整工具箱，全部功能默认注册。
2. 每个 feature 使用对象配置，统一启停、默认值、校验和生命周期规则。
3. 不设置“最小版/按需接入版”功能集合。配置负责补充业务数据、回调和参数；没有配置或数据时仍保留正常可打开的功能页，以空态展示。普通使用不需要理解内部 Feature、Controller 或存储适配器。
4. AI 仅凭公开文档即可接入现有 App，不要求安装专用接入 Skill，也不依赖指定 AI 工具。
5. Demo 验证功能，同时用实际打包产物验证真实消费者安装。
6. 旧 API 无需兼容。源代码、Demo、测试和文档在同一主版本完成切换。

本设计只约定目标接口和验收标准，不表示这些接口已存在。安装包、Pod 安装和原生重编译不计入“一行包装”的承诺；完整启动期采集也不属于默认入口的承诺。

## 2. 现状与设计选择

当前公开入口包括 `DebugView`、`initializeDebugToolkit`、Provider、各 feature 工厂和业务记录函数。`FeatureConfigs` 混合 boolean、对象和环境数组；导航 ref、环境和自定义功能又走独立入口。账号功能需要通过工厂或 Hook 生成自定义 feature。

主要依据：

- `src/core/initialize.ts`：配置类型、默认集合、注册表、异步构建模式判断。
- `src/ui/DebugView.tsx`：effect 初始化、独立导航 ref 和环境配置、异步卸载边界。
- `src/index.ts`：当前公开 API 清单。
- `src/features/quickAccounts/types.ts`：账号状态、切换、取消、回滚、存储作用域。
- `src/types/environment.ts`：host 数组与多服务 URL 配置两种环境语义。
- `src/utils/createDebugTab.ts`：自定义快照、订阅、渲染和生命周期。
- `Demo/metro.config.js`、`Demo/ios/Podfile`、`Demo/android/settings.gradle`：源码和父目录原生工程直连。

选择一个根组件包装入口，默认接入全部功能，配合统一的对象配置。功能是否出现不取决于调用方有没有提供配置。舍弃纯副作用 `import '.../auto'` 作为通用接入方式，避免全局修改 AppRegistry 和依赖宿主注册时机；不同时维护 JSX 包装、初始化函数与多个推荐入口。

## 3. 公开入口与使用层次

### 3.1 默认完整接入

```tsx
import { withDebugToolkit } from 'react-native-debug-toolkit';

function App() {
  return <AppContent />;
}

export default withDebugToolkit(App);
```

HOC 在模块作用域创建，保留 App 的 props 类型和透传行为，不在 render 中重新创建包装组件。不要求改动现有导航和业务 Provider 顺序。

这行包装注册全部 12 类功能页。Network/Console 等能自行采集的功能直接工作；账号、环境、状态等缺少业务输入时正常显示空态，不隐藏、不报配置缺失错误，也不要求为了展示入口先填写空对象。

### 3.2 提供业务数据和调整参数

```tsx
export default withDebugToolkit(App, {
  locale: 'zh-CN',
  network: { maxLogs: 100 },
  accounts: { items: testAccounts, onSwitch: switchAccount },
});
```

配置较多时放入 `debug.config.ts` 并显式 import；SDK 不扫描项目目录，也不要求 Babel/Metro 插件才能读取配置。

```ts
import type { DebugToolkitConfig } from 'react-native-debug-toolkit';

export const debugConfig = {
  locale: 'zh-CN',
  network: { maxLogs: 100 },
} satisfies DebugToolkitConfig;
```

```tsx
export default withDebugToolkit(App, debugConfig);
```

### 3.3 公共 API 边界

- 主入口导出 `withDebugToolkit`、`debug`、配置/数据源/事件类型。
- 可选状态库适配器使用明确子路径，例如 `react-native-debug-toolkit/adapters/zustand`；主入口不得因此导入 Zustand 或其他业务状态库。
- Provider、运行时容器、feature 工厂、Controller、存储适配器成为内部实现，不进入普通公开接口。
- 旧的通用格式化工具 `safeStringify/fmt` 不再作为 SDK API 导出。程序化面板控制收敛为 `debug.open()/close()`；当前日志清理为 `debug.clear(feature?)`，仅接受六类日志功能且不改变环境、账号或历史设置；当前诊断快照由 `debug.getReport()` 提供。全局关闭时这些动作不初始化运行时，报告只返回 disabled 状态。
- 不提供 default export，不保留旧函数名别名。需要历史 API 的项目应停留在旧主版本。
- Hub CLI 与传输协议不是这次 SDK API 清理的同义项。若传输层继续使用 `zustand` 等旧事件标识，由内部映射转换，不让调用方理解它们。
- `thirdPartyLibs` 中的 FLEX/DoraemonKit 入口没有进入现有公开导出或内置注册表，不算本次支持的第十三个 feature。移除其遗留 UI 引用和不可达代码，不新增一个未经验证的配置键。

## 4. 所有 Feature 的统一协议

### 4.1 配置形状

顶层只有全局 `enabled`、`locale` 和 feature 名称。每个 feature 都只能是对象，不接受 feature boolean、裸数组、裸 ref 或 feature 工厂实例。

```ts
type FeatureConfig<T extends object> = T & { enabled?: boolean };
```

feature 对象中的业务供给字段均允许省略。例如 `accounts: {}`、`environment: {}`、`tabs: {}` 都合法，并与省略对应 feature 一样显示正常空页。参数不齐全只影响相关动作能否执行，不决定功能是否接入。调用方明确提供的单个数据项仍需满足其结构，例如账号必须有 id/title，自定义组件项必须有 component；缺少供给与提供畸形数据是不同情况。

统一规则：

1. 省略 feature：仍注册并显示该功能，采用默认参数与空数据。
2. 提供对象且省略 `enabled`：补充该功能的参数和业务供给，不改变默认注册规则。
3. `enabled: false` 仅保留为显式关闭能力：不挂载该功能页、不安装采集/订阅、不执行所属后台任务。常规接入文档不要求填写任何开关，也不把它包装成另一种接入模式。
4. 不接受隐式深合并。每个 feature 的字段单独应用默认值；数组整体使用调用方提供的值；`undefined` 视为省略，`null` 只有字段明确允许时有效。
5. 省略业务列表、回调、ref 或 source 不报错。未知字段、类型错误、重复 ID、非法数值和已提供记录中的非法字段仍产生带路径的错误，不能当作正常空数据吞掉。
6. 配置初始化后固定。业务动态数据通过订阅源更新，不在 render 中重建配置，不提供任意运行时 `setConfig`。
7. 页面注册、实际能力与数据状态分开：空页是正常状态；缺少绑定/回调时说明原因并禁用相关动作；真实的原生不可用或配置错误在同一个页面显示原因，不隐藏入口。只有显式关闭或全局关闭才移除页面。

默认注册所有页面不等于启动所有业务行为。没有导航 ref 不启动等待 ref 的轮询；没有状态 source 不创建订阅；没有环境列表不安装 URL rewriter、不调用 onChange；没有账号数据/回调不触发认证；没有自定义组件不创建虚构业务组件。`debug.ready()` 把这类正常空页视为本地初始化完成，不因为未提供业务供给而失败或超时。

全局 `enabled` 默认根据原生构建模式判断，原生无法提供时回退可靠的 `__DEV__`，两者均不可判定时关闭。`enabled: false` 阻止所有功能副作用；`enabled: true` 是内测构建的显式 opt-in。全局关闭不能被某个 feature 的 `enabled: true` 覆盖。

### 4.2 完整功能表

下表均以全局已经允许启用为前提：每一行都有默认注册的可见页面，没有隐藏的按需功能集合。日志容量统一使用 `maxLogs`，默认 200 条内存记录；正整数参数必须校验，不静默截断非法值。

| Feature | 省略时的行为 | 配置对象的参数与默认值 | 业务依赖 |
| --- | --- | --- | --- |
| `network` | 开启 | `maxLogs: 200`；`excludeUrls: []`，支持字符串包含匹配和 RegExp | RN XHR 链路；不承诺拦截独立原生 HTTP 客户端 |
| `console` | 开启 | `maxLogs: 200`；采集 log/info/warn/error | 无 |
| `native` | 显示页面，按能力采集 | `maxLogs: 200`；`minLevel` 省略表示不过滤；`includeTags: []`、`excludeTags: []`；`pollIntervalMs: 500`，最小 100 | 原生模块不可用时显示原因，不保留空轮询 |
| `state` | 开启手动记录通道 | `maxLogs: 200`；`adapters: []` | 自动观察需要 store 适配器 |
| `navigation` | 开启手动记录通道 | `maxLogs: 200`；可选 `ref` | 自动观察需要 React Navigation ref；其他导航用手动事件 |
| `track` | 开启手动记录通道 | `maxLogs: 200` | 业务主动记录，不自动接管第三方埋点 SDK |
| `connect` | 显示页面，自动识别和发现 | 可选 `appId`、`endpoint`，均自动推导或发现 | 缺少 App 信息或 Hub 未连接时显示实际状态，不隐藏页面 |
| `clipboard` | 开启文本工具 | 仅通用 `enabled` | 系统剪贴板是可选能力；电脑传递需要 Console/Hub 通道 |
| `history` | 开启 | `maxSessions: 5`，包括当前会话 | 本地持久化；范围见第 5.5 节 |
| `environment` | 显示空环境页 | `items: []`；`defaultId` 默认取首项 id，无首项时为 null；可选 `onChange` | 没有环境列表时不重写请求；提供列表后才具备切换能力 |
| `accounts` | 显示空账号页 | `items: []`；可选 `onSwitch` 或动态数据 source；高级选项见第 5.3 节 | 只有账号而无回调时可查看列表，切换按钮禁用并说明原因 |
| `tabs` | 显示空的自定义页入口 | `items: []` | 提供 React 组件后显示自定义内容；无组件不造占位业务数据 |

所有功能的空页保留正常标题、布局和空态。普通无事件显示“暂无记录”；缺少数据源时说明“尚未提供状态源/账号/环境”；需要业务回调的按钮显示不可执行原因。错误和不可用状态单独说明，不伪装成“暂无记录”。空态不得伪造请求、账号或认证成功。

`state`、`navigation`、`track` 没有数据时，面板说明如何提供数据。零配置不意味着自动发现任意 store、路由库和埋点系统。

### 4.3 完整组合示意

以下变量代表业务已经定义的对象；公开文档必须另提供包含这些定义的可独立运行示例。

```tsx
withDebugToolkit(App, {
  locale: 'zh-CN',
  network: { maxLogs: 100, excludeUrls: ['/health'] },
  console: { maxLogs: 200 },
  native: { minLevel: 'warn' },
  connect: { appId: 'my-app' },
  state: { adapters: [cartAdapter] },
  navigation: { ref: navigationRef },
  track: {},
  environment: { items: environments, defaultId: 'dev' },
  accounts: { items: testAccounts, onSwitch: switchAccount },
  tabs: { items: [{ id: 'cart', title: '购物车', component: CartDebugPanel }] },
  clipboard: {},
  history: { maxSessions: 5 },
});
```

### 4.4 可省略的业务供给、泛型与互斥类型

`DebugToolkitConfig<TAccount, TTabSnapshots>` 使用以下业务字段合同，与第 4.2 节的其他功能字段直接组合。默认账号类型为 `DebugAccount`，默认 Tab 快照类型为 `readonly never[]`，所以普通组件和零配置不需要泛型参数。高级配置可以显式提供每个 Tab 的快照类型元组；`never` 表示该位置只有普通组件。

下列摘录展开可省略字段、互斥关系和类型推断；账号的其他可选回调按第 5.3 节加入 `AccountsOptions`。`ComponentType` 使用 React 类型，`DebugSource` 定义见第 5.1 节。配置对象可以为空；已提供 source 则必须遵守完整的 source 协议，不能返回结构错误的快照。

```ts
interface DebugAccount {
  id: string;
  title: string;
  subtitle?: string;
  note?: string;
}

interface AccountsSnapshot<A extends DebugAccount> {
  items: readonly A[];
  currentId?: string | null;
  scopeKey?: string;
  contextLabel?: string;
  isAuthenticated?: boolean;
  currentDetails?: readonly { title: string; value: string }[];
}

type AccountsData<A extends DebugAccount> =
  | (Partial<AccountsSnapshot<A>> & { source?: never })
  | ({ source: DebugSource<AccountsSnapshot<A>> } & {
      [K in keyof AccountsSnapshot<A>]?: never;
    });

type AccountsOptions<A extends DebugAccount> = AccountsData<A> & {
  onSwitch?(account: A, context: { signal: AbortSignal }): void | Promise<void>;
};

type DebugTab<S = never> = { id: string } & FeatureConfig<{
  title: string;
} & (
  | { source?: never; component: ComponentType<{}> }
  | { source: DebugSource<S>; component: ComponentType<{ snapshot: S }> }
)>;

type BusinessConfigContract<
  A extends DebugAccount = DebugAccount,
  S extends readonly unknown[] = readonly never[],
> = {
  accounts?: FeatureConfig<AccountsOptions<A>>;
  tabs?: FeatureConfig<{
    items?: { readonly [K in keyof S]: DebugTab<S[K]> };
  }>;
```

HOC 的目标泛型签名为：

```ts
declare function withDebugToolkit<
  P extends object,
  A extends DebugAccount = DebugAccount,
  S extends readonly unknown[] = readonly never[],
>(App: ComponentType<P>, config?: DebugToolkitConfig<A, S>): ComponentType<P>;
```

类型验收必须包括这些正反例，不能以 `any` 或调用方类型断言绕过：

- `{ accounts: { enabled: false } } satisfies DebugToolkitConfig` 有效。
- `{ accounts: {}, environment: {}, tabs: {} } satisfies DebugToolkitConfig` 有效，页面正常显示空态。
- 仅提供 accounts.items 或仅提供 onSwitch 都有效；只有两者具备时才能切换账号。
- source 与 items/currentId 等静态字段同时提供时报错。
- HOC 从 items 推导业务账号扩展字段；独立配置可用 `satisfies DebugToolkitConfig<MyAccount>`。
- 带快照与普通 Tab 混合时可用 `satisfies DebugToolkitConfig<MyAccount, readonly [CartSnapshot, never]>`；此配置能直接传入 HOC，无需补断言或丢失 App props 类型。
- 数据源 `CartSnapshot` 与需要其他 snapshot 类型的组件组合时报错。
- 裸 boolean、数组/ref 仍报错；`accounts: { enabled: someBoolean }` 有效，启用时显示空页。
- 已提供的账号项缺少 id/title、自定义项缺少 component、source 返回非法结构仍报错，不能由“允许空页”绕过。

## 5. 业务能力的具体约定

### 5.1 状态、导航、埋点

共用只读数据源协议，不能要求业务安装 Toolkit 的状态管理器：

```ts
interface DebugSource<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
```

`getSnapshot` 必须无副作用，未变化时保持稳定引用；`subscribe` 必须返回取消函数。源只在 feature 生效后订阅，暂停/卸载时释放。业务值允许是可序列化快照，函数和循环引用按既有日志序列化边界处理，不能执行它们。

状态适配器是 `{ id, getSnapshot, subscribe }`。SDK 在订阅建立时取初值，在通知时记录前后快照。普通 store 订阅的动作名固定为 `change`，不伪造业务 action 名。Zustand 便捷适配器只封装 `getState/subscribe`，不声称能还原 middleware 才能观察的命名动作。需要精确动作名时，业务显式记录事件。

导航 `ref` 使用与宿主共享的 React Navigation 根 ref。等待 ready、去重路由变化、取消等待和释放 listener 均由 SDK 管理；不另要求调用方挂一个 logger Hook。支持的 ref 接口在类型与文档中明确，不能把任意对象当作 ref 接受。

`debug` 只保留业务实际需要的动作，ID 和记录时间由 SDK 生成：

```ts
debug.track('checkout_failed', { reason: 'inventory_conflict' });
debug.state('cart', { action: 'add', before: previousCart, after: nextCart });
debug.navigation({ action: 'navigate', from: 'Home', to: 'Checkout' });
```

上述记录调用在全局或所属 feature 未就绪/关闭时为 no-op，不自动初始化、不缓冲初始化前事件、不影响业务返回值。采集时固定前后快照内容，不能持有随后可能被业务修改的活对象引用。

`debug.ready()` 返回本轮初始化结果及能力状态，供确定性复现/验证使用；配置错误时返回结构化失败，不抛未处理异常、不无限等待 Hub。宿主挂载前调用返回 `not_started`，全局关闭返回 `disabled`；初始化中调用复用本轮 promise，卸载时以 `cancelled` 结束。本地初始化最多等待 10 秒，超时使本轮 token 失效并返回 `initialization_timeout`。

HOC 明确在自身 `useLayoutEffect` 中同步注册宿主 token 和 ready promise，再启动异步构建门禁与初始化。业务普通 `useEffect` 执行时该 promise 已存在；不在模块求值或 render 中安装 hook/写全局运行时。子组件 render、模块顶层、早于父 layout effect 的子组件 layout effect 不属于可等待就绪的调用点。文档中的启动业务例子在普通 effect 内等待 ready；这只解决等待句柄的确定性，不宣称能捕获 ready 之前的事件。

### 5.2 环境切换

取消旧 host 数组与 managed 配置的双入口，统一为多服务 URL 前缀：

```ts
environment: {
  defaultId: 'dev',
  items: [
    { id: 'dev', title: '开发', urls: { api: 'https://dev.example.com/api' } },
    { id: 'staging', title: '预发', urls: { api: 'https://staging.example.com/api' } },
  ],
}
```

`environment` 省略或为空对象时，环境页正常显示空列表，切换和恢复按钮不可执行，不安装 rewriter，也不读取并应用过往环境选择。只有 defaultId 而无列表时仍属于供给未完整的正常空页，不猜测服务地址。

单服务只填一个 `api` key，多服务增加命名 key，不再引入另一种配置形状。有列表时 defaultId 省略则取第一项 id；显式提供时必须命中唯一 ID。每个环境使用相同服务 key，URL 必须是绝对 HTTP(S) URL。同一环境内歧义的相同前缀配置被拒绝。

只重写来自默认环境已声明服务前缀的请求，按最长前缀和路径边界匹配，保留剩余路径、query 和 hash；不修改其他域名或任意字符串片段。恢复默认环境时清除重写。验证必须覆盖 `/api` 不误匹配 `/api2`、根路径与尾斜线。

环境与 Network 共享内部 XHR hook，但分别持有资源引用；`network.enabled: false` 不关闭已显式开启的环境切换，也不因此偷偷记录请求。最后一个使用者释放时还原 hook。

共享服务必须同时拥有 collector 与 rewriter 的注册表。Network 的释放操作只移除自己的 collector，Environment 的释放只移除带本轮 owner token 的 rewriter；禁止任一 feature 直接执行无所有者的全局 `setUrlRewriter(null)`。过期 generation 的 cleanup 不能删除新 generation 的注册。只有 Environment 存在时使用只重写、不生成网络日志的 hook，只有 Network 存在时使用只采集、不改 URL 的 hook。

切换后新请求立即采用新前缀，既有请求不改写；App 自己缓存的服务客户端配置需要通过 `onChange(environment)` 更新。SDK 等待回调：成功后持久化选择；失败恢复 SDK 的前缀和选择并显示错误，业务回调负责自身副作用的回滚。切换串行执行，不并发接受另一个选择。

初始有效选择为“仍存在的持久化选择，否则 defaultId”。若提供 `onChange`，恢复阶段也通知业务有效环境；恢复失败退回默认选择并标记错误。对于回调负责更新的业务配置，文档要求业务在 `debug.ready()` 成功后再发起依赖该配置的启动请求。SDK 不假装能自动重启 App。

### 5.3 测试账号

账号页默认可见，不需要先填写配置。无 items/source 时使用空列表，不从“最近使用账号 ID”恢复出一个虚构账号。提供数据和切换逻辑的例子：

```ts
accounts: {
  items: [
    { id: 'tester-a', title: '测试账号 A' },
  ],
  onSwitch: async (account, { signal }) => {
    await loginByAccountId(account.id, { signal });
  },
}
```

`onSwitch` 可省略：有账号数据时正常显示列表和详情，切换按钮禁用并提示“尚未提供切换逻辑”。程序化 switchTo 在没有回调时返回 `not_configured`，没有目标账号时返回 `not_found`；均不写最近账号、不触发成功回调，也不假装登录成功。只提供回调而没有账号数据时仍显示空列表。

账号项公共显示字段为 `id`、`title`、可选 `subtitle`、`note`；泛型保留业务扩展字段，并让 `onSwitch` 收到原始账号对象。HOC 和 `DebugToolkitConfig<TAccount>` 都必须保留此类型关系，不能要求回调里断言业务账号类型。SDK 不把扩展字段自动作为 UI 详情或持久化整个账号对象。

高级字段：`currentId`、`scopeKey`、`contextLabel`、`isAuthenticated`、`currentDetails`、`onRollback(account, { reason, error })`、`onSuccess(account)`、`onError(error, account)`、`closeOnSuccess`（默认 true）。`scopeKey` 默认 `default`，用于隔离不同业务上下文的最近使用账号 ID。`currentDetails` 为显式提供的 `{ title, value }` 展示项；未提供认证状态时展示未知，不根据最近账号推断。

动态账号使用同一个配置对象中的 `source: DebugSource<AccountsSnapshot>` 替代全部静态账号数据字段；两组字段互斥。快照同时包含 `items`、可选 `currentId/scopeKey/contextLabel/isAuthenticated/currentDetails`，避免分开更新导致跨环境混用。`onSwitch` 等回调仍在配置对象内，不进入数据源。

每次 source 通知都重读快照，但只在切换相关输入变化时推进 operation generation：scopeKey 改变、目标账号消失或目标账号对象被替换、source 被释放，以及显式 suspend/宿主卸载。业务 source 应在账号输入未变化时保持账号对象身份稳定；替换对象会保守取消在途操作。`currentId/currentDetails/isAuthenticated/contextLabel` 是认证展示反馈，其更新不自动取消切换，否则本次登录正常更新认证状态就会取消自身。外部认证操作如果要中止在途切换，应显式 suspend 或改变 scopeKey；SDK 不猜测认证更新的来源。回调成功提交前再次核对 token、scope 与目标对象身份，之后才允许写最近账号、onSuccess 或收起面板。

SDK 负责 busy、重复点击保护、错误展示和成功后收起面板。切换串行处理；卸载、作用域变化或目标账号消失时 abort 并使本轮结果失效。业务回调即使忽略 signal，过期结果也不能覆盖当前 UI 或写入最近账号。保留现有补偿能力：已触发的切换失败或过期时调用可选 `onRollback`，SDK 不能承诺替业务撤销认证。认证状态以业务 source 为准；没有 source 时只展示“最近成功切换”，不声称它就是当前登录账号。

旧切换及补偿尚未结束时不得启动新切换；signal 是协作取消，不能强制终止业务 Promise。`onSuccess` 只在本轮成功提交后触发，其异常作为通知错误展示，不再次回滚已经成功的登录；`onError/onRollback` 自身异常也必须收敛为可见错误，不造成递归回调或永久遗漏清理。

高级业务编排通过 `debug.accounts.switchTo(id)`、`suspend()`、`resume()`、`waitForIdle()` 操作当前功能，不再获得内部 Controller。`switchTo` 返回 success/error/superseded/disabled/busy/not_configured/not_found 的结构化结果；挂起禁止新切换并取消当前切换，等待空闲覆盖在途回调和补偿完成。业务 Promise 不结束时 waitForIdle 也不能假称空闲，面板保持 busy/suspended 并说明原因。存在账号数据时的最近账号加载纳入 `debug.ready()`，空账号页不等候任何认证或数据补充，不再公开独立 `waitForStorage`。

### 5.4 自定义 Tab

`tabs` 对应始终可见的固定“自定义”功能入口。没有 items 时显示正常空页和组件配置提示；不能为未知业务组件创建虚构 Tab。提供 items 后在该入口内切换和展示对应组件，默认的十二类功能入口保持稳定，不根据 items 是否为空增删“自定义”入口。

每项固定为对象：`id`、`title`、`component` 必填；`enabled` 默认 true。高级选项是 `source`、`badge`、`onActivate`、`onDeactivate`、`onClear`，不要求用户构造内部 feature。

有 source 时，SDK 向组件传 `{ snapshot }` 并管理订阅；无 source 时组件自行读取外部 store。`badge(snapshot)` 只返回展示信息。这里的 activate/deactivate 指 Tab 功能的运行时挂载/释放，不是每次导航选中；普通组件显示生命周期由 React 控制。

HOC 的面板不能自动获得 `App` 内部 Provider 的 Context。依赖这种 Context 的数据应由业务桥接到 source，再传给 Tab；公开文档必须提供这个例子。不能宣称把任意使用 Context 的组件放入 `component` 就能运行，也不能为面板复制一个全新的认证 Provider 来伪装共享状态。

所有自定义 ID 在公共 Tab 命名空间内唯一，不能覆盖内置 ID；无效项在配置校验阶段指出。

### 5.5 剪贴板与历史

`clipboard` 统一控制文本工具 UI 和 `debug.copyToComputer(text, { label })`。它只在用户触发时执行，不轮询系统剪贴板。返回结果分别说明手机复制和电脑传递是否成功；电脑 Hub 未连接时只报告本地记录已生成，不能声称电脑已收到。

电脑传递通过显式 Console 记录和 Connect 上传实现，不依赖 monkey-patch console 后再猜回写是否被捕获。Console 关闭时不创建 Console 记录，Connect 关闭时不发送；工具显示不可用的通道及原因。系统剪贴板能力缺失只影响手机复制。全局或 clipboard 关闭时动作返回 disabled，不执行任何复制或写日志。

`history` 控制 Toolkit 日志的跨启动持久化与历史面板；关闭时继续支持当前会话的内存日志与 Hub 同步，不再读写历史日志，也不删除以前数据。环境选择、账号最近 ID 等用户偏好由各自 feature 管理，不受 history 开关控制。

持久化策略归内部 LogRuntime 所有：它分别提供日志存储策略和偏好存储。Network/Console/Native/Track 只能使用运行时注入的 store，不能自行回退到默认 MMKV；History 关闭时分配纯内存日志 store，不创建扫描或清理历史磁盘数据的任务，偏好仍走独立存储。下次以 History 开启的配置启动时，读取之前已保留的历史并按 maxSessions 执行正常保留策略；关闭期间的临时日志不被补写或恢复。配置本身不动态热切换，这里的重新开启指新一次初始化。

首期保留现有历史覆盖范围：Network、Console、Native、Track；State 和 Navigation 不宣称跨启动保留。保留容量为 Network 每会话最多 `min(maxLogs, 30)` 条，其余三类 `min(maxLogs, 50)` 条，最新记录优先；默认最多五个会话。此限制必须在文档和界面说明，不把内存 `maxLogs` 当作磁盘容量。

## 6. 零配置连接与运行时边界

### 6.1 App 标识和地址

- `connect.appId` 显式值优先，否则复用原生 `getAppInfo().nativeApplicationId`。跨平台标识不同时可显式统一；不生成每次启动变化的 appId。
- 获取不到标识时，本地面板继续可用，Connect 标记 unavailable 并提示填入 `connect.appId`；不使用易串 App 的通用占位标识。
- 地址优先级明确为：用户在面板保存的有效手动地址 > 配置 `endpoint` > Debug 自动发现。显式地址不可达时报告错误，不悄悄改连另一个 Hub；用户可清除手动地址恢复配置/自动模式。
- 自动发现复用 Metro host、平台候选及 Hub `/ready` 的协议检查。Release 不自动探测地址、不自动上传，即使全局显式启用，也需手动 Upload Once/Start Live Logs。
- Hub 未运行、后启动和重连均不阻断业务 App。发现/重连必须有超时、退避和可取消任务，关闭 Connect 后无残留请求。

### 6.2 初始化、所有权与失败

配置解析、运行时、采集服务和面板分离。HOC 负责宿主接入，内部统一管理构建门禁、数据源、共享 hook、存储和上传。不能只把现有 DebugView 再包一层。

第一版同一个 JS runtime 只允许一个顶层 Toolkit 宿主；多个并行宿主返回明确错误，不采用“后挂载者覆盖配置”。StrictMode 的探测挂载和 Fast Refresh 必须正确释放并重建同一逻辑宿主。

每次初始化持有 generation/cancellation token；每次 await、恢复存储和连接完成后复核 token。卸载先使 token 失效，再按拥有关系清理；过期异步结果不能安装 hook 或恢复 uploader。共享 XHR 等资源按功能引用计数管理。

未通过全局启用门禁前不安装采集。通过门禁后统一注册全部页面，再根据实际业务供给安装能够工作的采集、订阅和行为。页面注册与行为初始化必须分层，不能用 feature 工厂返回 null 表达“没有账号/环境配置”，导致页面一起消失。

`debug.ready()` 的完成只表示本地页面、已有供给的功能已完成初始化或给出真实失败结果。缺少业务数据、回调或绑定不算失败，不等候未来配置，不等待无限 Hub 重试，不保证此前的 render、模块 import 或网络事件被追溯捕获。完整启动期 bootstrap 作为独立后续需求，不给主入口增加第二次初始化步骤。

全局配置错误使 Toolkit 停用并通过原始开发日志和 ready 结果给出字段路径；某个 feature 的实际配置错误使其业务行为停止，但保留该功能页显示错误，其他独立功能继续。状态页不能把真实失败显示为全部就绪，也不能把正常空页归为失败。回调/订阅异常应隔离并释放相关资源，不让调试工具打断业务 App。

### 6.3 原生依赖与支持边界

首期继续以 MMKV 为明确必需依赖，统一 package manifest、lockfile、Pod 和 Android 依赖声明；不宣称选择 memory 就能绕过静态依赖或原生构建。

运行时存储异常须记录能力错误：实时采集可在内存中继续，History 标记不可用，依赖持久化的偏好只保留当前运行期并显示未保存。这个降级不等于支持缺少 MMKV 包/原生构建依赖。

验收以 RN CLI 项目为首要目标，同时验证包声明的最低 RN 版本和 Demo 使用版本。若依赖无法支持当前声明下限，必须在新主版本修正声明并补充验证结果，不能仅凭 Demo 构建成功继续宣称支持所有更低版本。Expo development build、Router 和其他入口只有经过对应安装样例验证后才加入支持表；Expo Go 不在本设计支持范围内。

关闭 Toolkit 是运行时行为，不承诺自动移除发布包中的 JS/native 代码或依赖体积。

## 7. AI 可直接使用的公开文档

不新增接入 Skill，不把现有运行时诊断 Skill 当作接入前提。AI 与人类使用同一份版本匹配的公开文档。

文档分为：

1. README：一行完整接入的安装步骤、可独立运行的 App 示例、全部默认功能及空态说明。
2. `docs/integration.md` 与中文对应页：单页自包含指南，包含项目识别、受支持入口的修改前后示例、原生重编译、Hub 连接、Release 边界及排障。
3. `docs/configuration.md` 与中文对应页：全部 feature 的字段类型、默认空数据、补充数据后可用的行为、显式禁用语义、实际采集范围和高级数据源例子。

AI 阅读路径必须能回答：装什么、改哪个入口、替换什么代码、怎样给现有功能补数据、何时需要重新构建、如何验证。默认示例不引用仓库私有 helper、不留未定义变量，也不要求读内部源码才能完成。文档不再让 AI 挑选要注册的功能，空态不是安装失败，也不允许为消除空态捏造业务数据。

示例作为可类型检查的文档样例维护；功能字段清单与类型/默认值定义进行一致性校验。安装命令使用明确包名和对应包管理器，不让 AI 猜 CLI 所属 npm 包。对未验证入口明确说明范围，不给猜测性自动修改步骤。

验证必须分别报告：依赖/静态配置有效、原生构建完成、当前 App 面板可用、当前会话收到本次事件。使用带唯一标记的 Console 和真实 HTTP 请求关联本次运行，记录 App/Session/构建身份；Hub `/ready`、旧会话或旧日志均不能单独证明接入成功。

`setup` 自动修改工具、新的 doctor/nonce 协议及纯副作用自动接入都后置，不作为本次交付条件。现有 Hub/CLI 能力和明确复现步骤足够支撑第一版文档接入验证。

## 8. Demo 与消费者验收

Demo 始终使用同一套完整功能集合，只改变提供的数据。保留购物场景作为业务数据齐全的 Showcase；另设置“零业务配置”验收用例，只包装根组件并触发 Console/真实请求，不手动初始化、不预填 appId/Hub endpoint、不接业务适配器。这个用例必须逐一打开全部十二类功能页，确认未供给业务数据的页面正常为空，不是精简版产品或另一套接入模式。

消费者 fixture 必须在父仓库以外的干净临时目录中安装 `npm pack` 产物。它可以复用 Demo 的业务组件，但不能保留父目录源码 alias、Jest/TS paths、iOS path pod 或 Android project include，也不能依靠父 node_modules 补齐依赖。先构建包，再验证 tarball 内的 JS、类型、原生文件和文档入口。

AI 验收只给未接入的 fixture、公开文档入口和任务要求；不给私有源码解释、不安装接入 Skill、不提供预先接好的根组件。记录 AI 的补丁、执行命令、阻塞项和当前会话证据；缺少设备或构建环境时报告未完成，不计为通过。

| 验收项 | 通过标准 |
| --- | --- |
| 全部 feature 的对象协议 | 每项省略/空对象/合法供给/显式关闭/错误字段都覆盖；空对象合法；裸 boolean/数组/ref 和旧字段被拒绝 |
| 零配置完整接入 | 默认十二类入口全部存在且可打开；无业务配置的页正常为空；Console/Network 可采集，Hub 可达时识别正确 App |
| 空态与副作用 | 无导航 ref 不轮询，无 store 不订阅，无环境不改 URL，无账号/回调不认证；空态不使 ready 失败，也不无限 loading |
| 关闭行为 | 无所属采集/计时器/订阅；共享资源只按其他启用 feature 的需要保留 |
| 初始化生命周期 | 覆盖异步检测前卸载、StrictMode、Fast Refresh、重复宿主、过期恢复；无重复 hook/日志 |
| 状态与导航 | 自动订阅无重复；手动事件可用；不伪造 action 名和未观察到的路由 |
| 环境 | 空列表不恢复旧地址或改写请求；首项默认/显式 defaultId；单/多服务、前缀边界、恢复默认、持久化恢复、回调失败；Network/Environment 分别关闭和反复初始化不误删对方资源 |
| 账号 | 无列表、只有列表、只有回调均正常显示且不伪造切换；静态/动态数据、作用域与目标对象变化、展示更新不取消自身、取消订阅、过期回调、回滚/重复点击 |
| 自定义 Tab | 固定入口在空 items 和有组件时都存在；普通组件、source 更新、Context 桥接、ID 冲突、订阅清理 |
| Clipboard/History | 通道缺失与结果真实；历史关闭无日志读写/清理但偏好可读写；旧历史保留、再次开启可恢复，关闭期间临时日志不补写；磁盘容量与文档一致 |
| Hub | 未启动、后启动、断连、显式地址失败；不串到其他 App/会话 |
| 原生安装 | 干净 tarball 消费者 iOS/Android Debug 构建；声明的 RN 版本边界有证据 |
| Release | 默认无 Toolkit 副作用；内测显式启用后仍手动上传；开发网络例外不扩散到生产配置 |
| 文档接入 | AI 仅凭公开文档完成接入与本次运行验证；复查已有接入不插入第二个宿主 |
| Showcase 回归 | 购物场景真实 409 → 切换环境 → 201，相关状态、埋点、文本传递可追踪 |

## 9. 实施边界与交付顺序

1. 建立统一类型、默认值、校验与完整 feature 注册定义，分离页面注册和业务行为就绪；明确新公共出口与旧出口移除清单。
2. 实现单宿主运行时、生命周期和共享资源所有权，再接入 HOC。
3. 逐项迁移全部功能，完成业务适配器与手动动作接口，不以“配置能编译”代替行为验收。
4. 更新 Demo 的零业务配置用例、完整业务 Showcase 和干净消费者 fixture，三者使用同一套完整功能集合。
5. 编写并验证公开接入/配置文档，进行只依赖文档的 AI 接入验收。

不在本设计内重写 Hub 架构、增加新的诊断 Skill、实现自动代码修改 CLI 或扩展完整启动期采集。后续实现计划按以上依赖拆分；本文件的批准不表示未经审阅的实现计划或代码已被批准。
