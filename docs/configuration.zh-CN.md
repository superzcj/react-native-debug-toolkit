# 配置参考

[接入指南](integration.zh-CN.md) · [English](configuration.md) · [完整可运行示例](examples/integration/App.tsx)

在模块作用域调用 `withDebugToolkit(App, config?)`。配置在当前宿主生命周期内固定，动态业务数据通过 source 更新。从 `react-native-debug-toolkit` 导入 `DebugToolkitConfig`，独立配置使用 `satisfies` 校验。

## 统一规则

十二个 feature 都使用对象。省略或 `{}` 都注册页面并应用默认值；缺业务数据是正常空态，不会为了填满页面虚构订阅或账号/环境操作。只有 `{ enabled: false }` 移除该功能页及其采集、订阅、后台任务。顶层 `enabled: false` 关闭整个工具箱，不启动运行时存储和采集。关闭不等于从构建中移除 JS 或原生依赖。

顶层 `enabled?: boolean` 默认读取原生 Debug 构建标记，原生检测不可用时回退到 JS 开发标记。Release 默认关闭；即使显式启用也不自动发现或上传 Hub，需在 Connect 点上传一次或开始实时日志。`locale?: 'en' | 'zh-CN'` 省略时检测设备语言，不匹配则回退英语；配置不接受 `auto` 字符串。

数组整体替换，不深合并。`undefined` 等于省略；只有明确允许的字段接受 `null`。未知字段、错误类型、非法数值、重复 ID 和畸形记录产生带路径的错误。全局配置错误停用工具箱；feature 配置错误保留错误页并隔离其行为。空态、不可用和错误是不同状态。

下表默认值采用 JSON，`undefined` 表示未提供；检查脚本直接与解析器元数据对照。environment.defaultId 规范化后的 null 不代表可以显式传 null。全部字段可选。

| 字段 | 解析器默认值 | 类型与行为 |
| --- | --- | --- |
| `network.enabled` | `true` | boolean；注册页面并采集 XHR。 |
| `network.maxLogs` | `200` | 正安全整数；内存记录上限。 |
| `network.excludeUrls` | `[]` | readonly (string 或 RegExp)[]；字符串按 URL 子串匹配。 |
| `console.enabled` | `true` | boolean；页面与 JS console 采集。 |
| `console.maxLogs` | `200` | 正安全整数；内存上限。 |
| `native.enabled` | `true` | boolean；页面与受支持的原生日志采集。 |
| `native.maxLogs` | `200` | 正安全整数；内存上限。 |
| `native.minLevel` | `undefined` | trace/debug/info/warn/error/fatal/unknown；省略则不配置级别过滤。 |
| `native.includeTags` | `[]` | readonly string[]；空数组不限制允许的标签。 |
| `native.excludeTags` | `[]` | readonly string[]；排除对应标签。 |
| `native.pollIntervalMs` | `500` | ≥100 的安全整数；轮询间隔（毫秒）。 |
| `state.enabled` | `true` | boolean；页面、adapter 订阅和显式状态记录。 |
| `state.maxLogs` | `200` | 正安全整数；内存上限。 |
| `state.adapters` | `[]` | readonly StateAdapter[]；每项有唯一非空 id、getSnapshot、subscribe。 |
| `navigation.enabled` | `true` | boolean；页面、ref 观察及显式导航事件。 |
| `navigation.maxLogs` | `200` | 正安全整数；内存上限。 |
| `navigation.ref` | `undefined` | { current: DebugNavigationRef 或 null }；传实际导航根 ref。 |
| `track.enabled` | `true` | boolean；页面与显式埋点事件。 |
| `track.maxLogs` | `200` | 正安全整数；内存上限。 |
| `connect.enabled` | `true` | boolean；页面、发现和上传任务。 |
| `connect.appId` | `undefined` | string；否则使用 nativeApplicationId；缺少原生标识时 Connect 不可用。 |
| `connect.endpoint` | `undefined` | string；显式 Hub HTTP(S) 地址；面板保存的手动地址优先。 |
| `clipboard.enabled` | `true` | boolean；文本页面及 copyToComputer 动作；不轮询剪贴板。 |
| `history.enabled` | `true` | boolean；历史日志磁盘读写和页面；业务偏好独立。 |
| `history.maxSessions` | `5` | 正安全整数；保留会话数上限。 |
| `environment.enabled` | `true` | boolean；页面与所属 URL 重写。 |
| `environment.items` | `[]` | readonly DebugEnvironment[]；每项必填 id、title、urls。 |
| `environment.defaultId` | `null` | 输入可选 string；无列表规范化为 null；有列表时默认第一项 id。 |
| `environment.onChange` | `undefined` | (environment) => void 或 Promise<void>；恢复初始选择时也调用。 |
| `accounts.enabled` | `true` | boolean；账号页、数据源和切换。 |
| `accounts.items` | `[]` | readonly A[]；id/title 必填、subtitle/note 可选；与 source 互斥。 |
| `accounts.currentId` | `undefined` | string 或 null；真实业务身份，不从最近选择推断。 |
| `accounts.scopeKey` | `"default"` | string；按业务上下文隔离最近账号 ID。 |
| `accounts.contextLabel` | `undefined` | string；业务上下文说明。 |
| `accounts.isAuthenticated` | `undefined` | boolean；省略表示认证状态未知。 |
| `accounts.currentDetails` | `undefined` | readonly { title: string, value: string }[]；显式展示字段。 |
| `accounts.source` | `undefined` | DebugSource<AccountsSnapshot<A>>；替代全部六个静态账号数据字段。 |
| `accounts.onSwitch` | `undefined` | (account, { signal }) => void 或 Promise<void>；由业务负责认证。 |
| `accounts.onRollback` | `undefined` | (account, { reason, error? }) => void 或 Promise<void>；reason 为 error 或 superseded。 |
| `accounts.onSuccess` | `undefined` | (account) => void 或 Promise<void>；仅成功提交后调用。 |
| `accounts.onError` | `undefined` | (error, account) => void 或 Promise<void>；报告切换失败。 |
| `accounts.closeOnSuccess` | `true` | boolean；成功切换后收起面板。 |
| `tabs.enabled` | `true` | boolean；固定自定义页与配置项生命周期。 |
| `tabs.items` | `[]` | readonly 类型化 DebugTab 元组；每项必填 id/title/component。 |

## 快捷操作

`quickActions` 为浮动入口增加最多五个业务操作，不会新增功能页：

```tsx
quickActions: {
  items: [
    { id: 'reset-cart', title: '清空购物车', icon: '↺', onPress: () => cart.reset() },
    { id: 'refresh', title: '刷新', onPress: async () => refreshData() },
  ],
}
```

长按浮动入口约 450 毫秒打开向内的放射菜单，再点击操作。移动会取消长按并继续拖动；菜单打开后松手仍保持菜单。点击中心、背景或 Android 返回键可关闭菜单。读屏用户可通过“打开快捷操作”自定义操作展开菜单，无需长按。`closeOnPress` 默认为 `true`，导航操作会在回调前关闭菜单；设为 `false` 时菜单保持打开，并显示忙碌指示及成功/失败反馈。禁用操作会被正确标记且不会执行。回调在点击后调用；需要最新业务数据时，在回调内读取应用的 ref/store，避免捕获旧值。动作配置在宿主生命周期内固定。

操作 ID 必须唯一，ID 和标题必须是非空字符串，`onPress` 必须是函数。无效配置会产生带路径的全局错误。空间不足时使用带关闭按钮的可滚动网格，保留完整触摸区域。常规布局将标题和触摸区域一起纳入边界检查。iOS 使用核心 SafeAreaView 的实测内容区域；Android 使用宿主可用区域，不读取系统 WindowInsets，边到边布局应在安全内容区挂载工具箱。遵循系统“减少动态效果”设置。不额外触发整机振动。

## 默认页面与采集

Network 采集初始化后的 React Native XHR；绕过 XHR 的原生客户端不在范围内。文本/JSON 响应可查看，部分 fetch 实现只暴露 Blob 元数据。Console 观察 JS console。Native 采集受支持的 iOS RCTLog 或 Android 当前进程可见的 logcat；原生能力不可用时显示真实状态。

State 在无 adapter/显式事件时为空，Navigation 在无 ref/显式事件时为空，Track 等待埋点调用。Accounts、Environment、Custom 无列表也保留页面。Clipboard 只在用户操作时工作。History 展示已保留的受支持日志。Connect 使用原生 App 标识，Debug 下 Hub 可达时可自动发现并上传；Hub 离线不会阻断 App。

## Source、状态与导航

`DebugSource<T>` 为 `{ getSnapshot(): T; subscribe(listener: () => void): () => void }`。读取无副作用，数据未变时返回同一个引用；变更时先保存新快照，再通知 listeners。订阅返回取消函数，在运行时释放、取消或错误时清理。配置、source、未变化的账号项保持稳定引用。[完整 store 示例](examples/integration/source.ts) 不依赖第三方状态库。

StateAdapter 额外包含 id，读取初始快照并记录后续变化；普通订阅的 action 固定为 change，不推断业务动作名。可选 `zustandAdapter(id, store)` 从 `react-native-debug-toolkit/adapters/zustand` 导入，接受现有 store 的 getState/subscribe；主入口不导入 Zustand。精确业务事件可用 `debug.state('cart', { action: 'add', before, after })`。记录时固定经过净化的快照，不调用函数/getter，也不让之后的业务修改回写旧日志。

导航传 App 实际导航根使用的同一个 ref。current 初始可为 null；就绪实例提供 `getCurrentRoute(): { key?: string; name: string } | undefined`、`getRootState(): unknown`、`addListener('state', listener): () => void`，可选 `isReady(): boolean`。工具箱负责等待、路由去重和取消监听，不接受裸导航对象，也不会发现任意路由库。其他路由可显式调用 `debug.navigation({ action: 'navigate', from: 'Home', to: 'Checkout' })`。

## 环境

每项为 `{ id, title, urls: { api: 'https://dev.example.com/api' } }`。所有项使用相同且非空的服务 key；地址必须是绝对 HTTP(S) URL，ID 唯一，同一环境内相同的歧义前缀会被拒绝。有列表时显式 defaultId 必须存在；无列表即使提供 defaultId 也是正常空页，不应用旧选择。

只重写默认环境声明的服务前缀，最长路径边界匹配优先，/api 不匹配 /api2；保留剩余路径、query、hash，不改无关 URL，也不改已有请求。关闭 Network 不影响有效环境重写。

切换串行执行。onChange 更新业务缓存的 API 客户端；成功后持久化选择，失败恢复工具箱选择与前缀，业务副作用由回调自行回滚。初始化恢复仍有效的已保存选择，否则默认选择，并调用 onChange；恢复失败回退默认并显示错误。依赖该回调的启动请求须等待 ready 并确认 Environment 状态。

## 账号

静态数据包含 items/currentId/scopeKey/contextLabel/isAuthenticated/currentDetails。source 替代全部六项，不可混用；快照必须有 items，可选其余五项，回调仍放配置中。静态 items 省略为 []；source 模式不向快照注入静态默认数据。

仅提供 items 可以查看，但没有 onSwitch 则禁用切换；仅提供 onSwitch 仍为空列表。回调收到原始泛型账号对象及业务扩展字段；只有显式展示字段会显示，不持久化完整账号。未提供认证信息时，最近切换成功不等于当前已登录。

切换串行执行。检查 signal.aborted，并把 signal 传给可取消业务操作。作用域变化、目标项删除/对象替换、suspend、卸载都会使操作失效，迟到结果不能写最近 ID 或提交成功。currentId/currentDetails/isAuthenticated/contextLabel 的反馈更新不会取消本次切换。未变化的账号对象应保持身份稳定。

onRollback 可补偿已触发后失败或过期的操作；SDK 无法替业务撤销认证。旧回调和补偿完成前不能启动新切换。onSuccess 抛错属于通知失败，不回滚已成功的登录；回调异常会显示。永不结束的业务 Promise 无法被强制中止。

debug.accounts.switchTo(id) 返回 success/error/superseded/disabled/busy/not_configured/not_found。suspend() 禁止新切换并取消当前操作，resume() 恢复，waitForIdle() 等待回调和补偿完成，而非仅等待 abort。非空账号的最近 ID 恢复纳入 ready；空页不等待未来账号数据。

`debug.environment.switchTo(id)` 使用已配置的环境控制器，保证 SDK URL 重写、持久化选择、入口徽章和 `environment.onChange` 保持同步。环境功能不可用或关闭时，该操作保持无效。

## 自定义页与 Context

每项必填唯一非空 id/title 和 component。ID 不可重复或与表中的内置 key 冲突。项级 enabled?: boolean 默认 true；可选 source、badge、onActivate、onDeactivate、onClear。有 source 时组件接收 { snapshot }，badge(snapshot) 返回 { label: string, color: string } 或 null；无 source 时组件无必填 props，badge() 无参数。生命周期回调返回 void。activate/deactivate 指运行时激活/释放，不是导航选中切换。

混合 source 组件和普通组件可用 `DebugToolkitConfig<MyAccount, readonly [Snapshot, never]>`。[完整配置](examples/integration/debug.config.tsx) 包含类型化 items/onSwitch 和读取 source 的自定义组件，全部 import 与变量均已定义。

Overlay 不在 App 内部 Provider 中，自定义组件不会自动共享内部 Context。[完整 App](examples/integration/App.tsx) 以一个外部 store 同时供给内部 Context Provider 和自定义页 source。业务代码更新 store，面板接收 snapshot；不要在 Overlay 再建一个认证 Provider 冒充共享状态。

## 历史、清理与复制

History 仅持久化 Network、Console、Native、Track；State、Navigation 只在当前会话内存中。每会话磁盘上限：Network 为 min(maxLogs, 30)，其余三类为 min(maxLogs, 50)，优先保留最新记录，默认最多五个会话。内存 maxLogs 不等于磁盘容量。关闭 History 不读取、写入或删除既有历史；当前内存与 Hub 同步仍工作。后续启用可读取此前保留的历史，关闭期间不补写。环境/账号偏好独立保存。

debug.clear() 清理当前日志；debug.clear(feature) 只接受 network/console/native/state/navigation/track，不重置环境、账号或历史会话。debug.getReport() 返回当前 status/features/logs 和可用的 appId/sessionId，不启动宿主；debug.open()/close() 控制面板。

await debug.copyToComputer(text, { label }) 返回 status completed 或 disabled，并分别返回 phone/console/hub 的 success/unavailable/disabled/error 及可选 reason。completed 不代表全部成功。phone success 表示已链接的可选剪贴板模块完成本机复制，console success 表示已有本地 Console 记录，hub success 表示现有事件协议确认收到该事件，不代表电脑剪贴板已更改；在 Hub Console 查看并复制。Console/Connect 关闭则对应链路不工作；缺原生剪贴板只影响 phone，Hub 离线为 unavailable，发送失败为 error。暂停时复制只发送显式文本，不上传无关暂停日志；顺序交付受阻可能返回错误，需恢复同步后重试。全局或 Clipboard 关闭不复制也不写日志。

## 初始化与错误

debug.ready() 返回结构化结果 ready/partial/disabled/not_started/cancelled/initialization_timeout/error，附各 feature 的 initializing/ready/empty/unavailable/error 及字段路径。空业务页是正常状态。本地初始化限时 10 秒，不等待 Hub 在线或未来数据。

在普通 React useEffect 或挂载后的用户操作中等待。HOC 在 layout effect 注册 ready 句柄；模块顶层、render、比父 layout effect 更早的子 layout effect 不属于可等待调用点。未挂载返回 not_started，卸载取消未完成的等待。同一 JS runtime 只能有一个宿主；HOC 定义在模块作用域，已有包装应修改原处，不重复添加。

所属功能 ready 前或关闭后的 track/state/navigation 调用为 no-op，不重放。XHR/console 从各自完成安装后采集；ready 不补采此前 import、render、网络事件。ready 描述初始化结果，后续 source 错误在功能状态中呈现。原生存储失败时实时内存采集可能继续，History 不可用、偏好未保存；这不免除原生安装要求。
