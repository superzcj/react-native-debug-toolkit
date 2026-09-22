# 功能使用

[English](usage.md) · [接入指南](integration.zh-CN.md) · [配置参考](configuration.zh-CN.md)

withDebugToolkit(App) 默认包含全部十二个功能。缺业务数据是正常空态；feature 对象补数据/回调，source 提供动态值。

完整示例包括 [App.tsx](examples/integration/App.tsx)、[debug.config.tsx](examples/integration/debug.config.tsx)、[source.ts](examples/integration/source.ts)、[Verification.tsx](examples/integration/Verification.tsx)：本地账号切换、稳定外部 store、Context 桥接、State adapter 和自定义组件，全部变量/import 都已定义。

| 需求 | 公开 API |
| --- | --- |
| 采集/语言配置 | network.maxLogs/excludeUrls、console.maxLogs、native 过滤、locale |
| 状态 | state.adapters 的 id/getSnapshot/subscribe，或 debug.state(id, event) |
| 导航 | navigation.ref 或 debug.navigation(event) |
| 埋点 | debug.track(name, data?) |
| 服务 URL 切换 | environment.items/defaultId/onChange |
| 账号 | accounts.items/onSwitch 或 source、debug.accounts 方法 |
| 业务面板 | tabs.items 的 component 和可选 source |
| 复制/清理/报告 | debug.copyToComputer、debug.clear、debug.getReport |
| 面板/就绪 | debug.open()、debug.close()、debug.ready() |

默认值、source 互斥、回调、取消、Context 边界、磁盘容量与复制结果见[完整参考](configuration.zh-CN.md)。Zustand 可选 adapter 从 react-native-debug-toolkit/adapters/zustand 导入，普通订阅记为 change，不推断业务动作名。SDK 不自动发现 store、路由或埋点系统。

[Hub 命令与浏览器语言](setup.zh-CN.md) 独立于 SDK 配置。[Demo](../Demo/README.md) 验证空数据与完整业务配置。
