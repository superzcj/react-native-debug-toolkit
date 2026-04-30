# React Native Debug Toolkit 产品路线图与 Issue 草案

更新日期：2026-04-16

## 1. 结论摘要

当前产品已经具备一个清晰雏形：

- 以开发态悬浮按钮作为统一入口
- 在 App 内聚合 `network`、`console`、`zustand`、`navigation`、`track`、`thirdPartyLibs`
- 支持低接入成本的 feature 扩展

它的优势不是“替代 React Native 官方调试器”，而是“把业务流程相关的调试信号放进 App 内，做到人人可用”。

推荐定位：

**面向 React Native 团队的 in-app 调试 / QA 工作台**

这比“另一个日志面板”更有产品空间，也更能避开 React Native DevTools 的正面竞争。

## 2. 当前能力判断

### 已有优势

- 低接入：初始化简单，按 feature 开关启用
- 体验轻：直接在 App 内查看，不依赖外部桌面工具
- 信号覆盖合理：网络、日志、状态、导航、埋点都已接入
- 可扩展：`DebugFeature` 接口设计允许持续加能力
- 业务友好：`track`、`navigation`、`zustand` 的组合，天然适合排查业务流程问题

### 主要短板

- 仍以“分 tab 查看” 为主，跨信号关联弱
- 缺少统一会话视角，难以回答“问题发生前后到底发生了什么”
- 缺少分享闭环，QA/产品很难把问题上下文一键给开发
- 缺少复现能力，网络请求只能看，不能改、不能重放、不能 mock
- 缺少隐私与噪音控制，只做了局部过滤，还没有全局策略
- 缺少性能维度，无法覆盖“为什么慢”“哪个动作卡”的高频问题

### 产品风险

- 如果继续只加更多 tab，产品会越来越像“日志收纳箱”
- 如果直接追 React Native DevTools 的断点、内存、源码调试，会进入高成本低差异化赛道

## 3. 竞品与相邻工具启发

### React Native DevTools

- 官方主路径已经很清晰：断点、Console、Network、Performance、Memory、React 组件调试
- 它更偏底层代码调试和运行时分析
- 结论：不要和它抢“官方基础调试器”的位置

### Reactotron

- 强项是状态、插件化、命令式调试、状态回放
- 启发：状态类能力不应停留在“看 before/after”，应继续向 diff、snapshot restore、replay 发展

### Flipper

- 老一代一体化移动调试平台已经退场，React Native 支持也已停止演进
- 结论：市场上仍存在“一站式移动调试工作台”的空档，但形态不一定必须是桌面端

### Proxyman / Charles

- 强项不只是抓包，而是 Repeat、Map Local、Breakpoint、Mock、Rewrite、Throttle
- 启发：网络能力的下一阶段不是“更详细地展示”，而是“帮助复现”

### Jam / Session Replay 类工具

- 强项是把 replay、console、network、device info 打包成一个问题链接
- 启发：协作闭环本身就是功能，不只是附属能力

## 4. 推荐定位

### 一句话定位

**在 App 内，把技术日志和业务行为串起来，帮助开发、测试、产品快速定位并复现问题。**

### 目标用户

- React Native 开发
- 测试 / QA
- 技术产品经理
- 需要和开发共同排查问题的运营 / 实施同学

### 核心任务

1. 快速知道发生了什么
2. 快速判断问题在哪一层
3. 快速把现场打包给别人
4. 快速再次复现同一个问题

## 5. 产品原则

1. 优先强化 App 内工作流
2. 优先做跨信号关联，不优先加孤立 tab
3. 优先做复现和分享，不优先做更复杂的展示
4. 默认考虑脱敏、筛噪、性能开销
5. 与 React Native DevTools 互补，而不是替代

## 6. 优先级建议

### P0：必须做

- 统一会话时间线
- 全局过滤与噪音控制
- 调试会话导出 / 分享
- 统一数据模型与 metadata

### P1：高价值增强

- 网络重放 / 编辑重放
- 网络 mock / 延迟模拟
- Zustand diff 与 snapshot restore
- 问题标记与重点事件聚合

### P2：中期扩展

- 轻量性能视图
- 环境 / Deep Link / Feature Flag / 本地存储工具箱
- 团队协作能力
- 自动问题摘要

## 7. 路线图

### 阶段一：从“日志面板”升级到“问题上下文面板”

目标：先解决“看不全、串不起来、发不出去”。

### 7.1 统一 Session Timeline

新增一个 `Timeline` 或 `Session` 主视图：

- 按时间串联 network、console、track、navigation、zustand
- 支持按类型筛选
- 支持按 screen、error only、action name、request method 过滤
- 支持点击事件跳转到原 tab 的详情
- 支持手动插入标记点，如“点击支付按钮”“进入订单页”

用户价值：

- 不再需要来回切 tab 拼现场
- 更适合 QA 和产品同学理解一次问题过程

### 7.2 全局过滤与隐私控制

新增全局设置：

- Console level 过滤
- URL / action / event 黑白名单
- 敏感字段脱敏规则
- 是否保留 reload 前日志
- 最大日志数量与内存上限

用户价值：

- 减少无关噪音
- 让工具能进入更真实的业务场景

### 7.3 会话导出

新增“导出问题包”：

- 导出最近一次会话的 JSON
- 包含 device info、route、时间范围、network、console、track、zustand、navigation
- Network 可附带可选 HAR 风格结构
- 支持复制 JSON、分享文件、回传给自家接口

用户价值：

- QA 和开发的沟通成本立刻下降
- 这个能力可以成为未来协作闭环的基础

### 阶段二：从“看到问题”升级到“复现问题”

目标：减少切换外部代理工具的次数。

### 7.4 Network Replay

- 在请求详情页加入 `Replay`
- 支持编辑 URL / headers / body 后重放
- 自动生成 replay 记录，回写到 Timeline

### 7.5 Network Mock / Delay

- 对单个请求配置 mock 响应
- 对 URL 规则配置延迟、失败率、固定状态码
- 允许预置 `Slow 3G`、`500 error once`、`timeout` 模板

### 7.6 Zustand Diff / Snapshot Restore

- 对象 diff 高亮，而不是只展示整块 JSON
- 支持保存某次状态为 snapshot
- 支持将 snapshot restore 回本地 store

用户价值：

- 让状态调试从“观察”走向“验证”

### 阶段三：从“个人调试工具”升级到“团队问题工作台”

目标：形成团队协作与复盘能力。

### 7.7 Issue 模式

- 允许将某个时间点或时间范围标记为一个 issue
- 自动汇总相关请求、错误、路由变化、埋点
- 自动生成标题建议和问题摘要

### 7.8 Tools 扩展区

将 `thirdPartyLibs` 升级为更通用的 `Tools`：

- Debug Libraries
- Environment Switcher
- Deep Link Launcher
- Feature Flag Panel
- AsyncStorage / MMKV Viewer
- User Context Switcher

### 7.9 轻量性能视图

不直接复制官方 profiler，而是做与业务流程相关的性能视图：

- 慢请求排行
- 慢页面切换排行
- 慢 action 排行
- 手动埋点的交互耗时统计

## 8. 建议度量指标

建议从以下维度衡量产品是否真的变强：

- 初始化激活率：接入后实际启用 toolkit 的项目占比
- 周使用率：每周至少打开一次面板的开发者占比
- 诊断效率：从发现问题到定位根因的平均时间
- 协作效率：QA 提交的问题里，带完整上下文的问题占比
- 复现效率：带 replay / export 的问题复现成功率

## 9. 可直接拆分的 Issue 草案

下面的 issue 草案按建议优先级排序，可以直接转成 GitHub Issues。

### Issue 1：新增统一 Session Timeline 视图

**标题**

`feat: add unified session timeline for cross-feature debugging`

**背景**

当前数据分散在多个 tab 中，用户需要自己拼装事件顺序，排查效率低。

**范围**

- 新增 `timeline` 内建 feature
- 将 network、console、navigation、zustand、track 统一映射到标准事件结构
- 支持时间倒序 / 正序切换
- 支持点击某事件后跳转到原始详情

**验收标准**

- 能在一个视图中看到所有事件
- 能按事件类型过滤
- 能按时间排序
- 点击事件可打开对应详情

### Issue 2：新增全局过滤栏与会话设置

**标题**

`feat: add global filters and session settings`

**背景**

目前只有 Network 支持搜索，其他 feature 的过滤能力不足。

**范围**

- 面板顶部新增全局过滤入口
- 支持 `error only`、`screen`、`keyword`、`log level` 过滤
- 支持全局最大日志条数设置
- 支持保留日志开关

**验收标准**

- 过滤条件对多个 feature 同时生效
- 过滤状态在当前会话内保留
- 清空过滤后能恢复默认视图

### Issue 3：新增会话导出能力

**标题**

`feat: export debug session bundle`

**背景**

当前排查现场无法低成本分享给其他角色。

**范围**

- 导出 JSON 文件
- 包含基础环境信息与各类日志
- 支持复制到剪贴板
- 预留自定义上传钩子

**验收标准**

- 导出的 JSON 能完整包含当前会话主要事件
- 导出不依赖额外原生能力也能工作
- 上传钩子可由业务方接入

### Issue 4：新增敏感字段脱敏与忽略规则

**标题**

`feat: add redaction and ignore rules for logs and requests`

**背景**

工具会进入更真实的业务环境，必须优先处理 token、cookie、手机号等敏感字段。

**范围**

- 支持按 key 名脱敏
- 支持按 URL / action / event 忽略
- 支持默认内置一批常见敏感字段

**验收标准**

- 导出与 UI 展示都应用脱敏规则
- 默认规则开箱即用
- 支持用户扩展规则

### Issue 5：Network 详情页支持 Replay

**标题**

`feat: replay network requests from inspector`

**背景**

当前网络能力能看不能试，和代理工具相比差一个关键动作。

**范围**

- 请求详情页增加 `Replay` 按钮
- 支持编辑 URL、headers、body 后重发
- Replay 结果重新进入网络日志

**验收标准**

- 可从现有请求发起重放
- 可编辑并成功重放
- 重放日志能标识来源

### Issue 6：新增 Network Mock / Delay Profiles

**标题**

`feat: add network mock and delay profiles`

**背景**

弱网、超时、固定错误码是高频调试场景。

**范围**

- 支持按 URL 规则配置 mock response
- 支持设置固定延迟、超时、状态码
- 提供几个默认模板

**验收标准**

- 命中的请求会按规则返回 mock 结果
- UI 中能看到 mock 命中状态
- 规则可启用、禁用、删除

### Issue 7：Zustand 详情页支持结构化 Diff

**标题**

`feat: add structured diff view for zustand changes`

**背景**

当前前后状态是整块 JSON，不适合快速找变化点。

**范围**

- 高亮新增、删除、修改字段
- 支持折叠未变化节点
- 支持按 storeName 过滤

**验收标准**

- 状态变化可以结构化查看
- 变化字段高亮清晰
- 大对象仍保持可读性

### Issue 8：支持 Zustand Snapshot Restore

**标题**

`feat: restore zustand snapshot from captured state`

**背景**

如果只能看状态而不能回放，验证问题仍然需要人工操作。

**范围**

- 保存某条日志的 nextState 为 snapshot
- 提供 restore API 钩子
- UI 上支持恢复并写入记录

**验收标准**

- 业务方可选择接入 restore 能力
- 恢复动作会写入新的调试记录
- 未接入 restore 时 UI 有明确降级说明

### Issue 9：新增手动标记与重点事件聚合

**标题**

`feat: add markers and highlighted moments in session timeline`

**背景**

排查问题时，用户往往知道“某次点击”很关键，但目前无法手动标记。

**范围**

- 支持插入 marker
- 支持 pin 某条日志
- Timeline 中聚合展示错误和标记点

**验收标准**

- 用户可以快速定位关键时刻
- 导出结果中包含 marker 信息

### Issue 10：将 thirdPartyLibs 升级为 Tools

**标题**

`feat: evolve thirdPartyLibs tab into extensible tools hub`

**背景**

当前 `thirdPartyLibs` 偏窄，未来更适合承载环境与调试辅助能力。

**范围**

- 将展示层升级为 `Tools`
- 兼容现有 FLEX / DoraemonKit
- 为 Deep Link、环境切换、Feature Flag、存储查看器预留卡片模型

**验收标准**

- 现有能力不回退
- 新模型可以承载不同类型工具动作
- 文案与结构不再局限“第三方库”

## 10. 推荐执行顺序

如果只做最小闭环，推荐按下面顺序推进：

1. `Session Timeline`
2. `Global Filters + Redaction`
3. `Export Session Bundle`
4. `Network Replay`
5. `Zustand Diff`

这个顺序的好处是：

- 先解决“看不全”
- 再解决“信息太乱”
- 再解决“发不出去”
- 最后解决“复现不起来”

## 11. 不建议近期投入的方向

- 自研完整 JS 断点调试器
- 与官方 DevTools 对标的 Memory / Source 面板
- 复杂桌面客户端
- 过早引入远程云端平台依赖

这些方向不是没有价值，而是当前阶段性价比不高，也容易把产品做重。

## 12. 参考资料

- React Native DevTools: https://reactnative.dev/docs/react-native-devtools
- Reactotron: https://docs.infinite.red/reactotron/
- Reactotron Redux plugin: https://docs.infinite.red/reactotron/plugins/redux/
- Flipper repository: https://github.com/facebook/flipper
- Proxyman docs: https://docs.proxyman.com/
- Jam Instant Replay: https://jam.dev/docs/record-a-jam/instant-replay
