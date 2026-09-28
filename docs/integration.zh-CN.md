# 接入现有 React Native App

[English](integration.md) · [全部配置字段](configuration.zh-CN.md) · [完整示例](examples/integration/App.tsx)

本指南供人和 AI 编程助手使用，适用于版本 4.1.1。先读本页，补充业务数据时再读 configuration.zh-CN.md 和随包示例。无需接入 Skill、内部源码、指定 AI 产品或新的 setup CLI。

## 1. 找到现有根入口

检查 package.json、入口文件（通常 index.js）和 AppRegistry 注册的组件。保留应用注册名、现有导航、Provider、props 和包装关系。已有 Toolkit 包装时修改原处，不再加第二个宿主。HOC 定义在模块作用域，不能在 render 内创建。此版本不兼容旧初始化 API。

当前验证范围：

| 入口 / 平台 | 证据与边界 |
| --- | --- |
| React Native CLI、npm、RN 0.85.1、新架构 | 已验证独立安装包消费者安装、TypeScript、renderer、原生 autolinking、iOS Pod 安装。原生 Debug/Release 构建与设备验收仍需单独验证。 |
| RN 0.76.6 至 0.85.1 | 声明的候选 peer 范围；根 JS/类型测试使用 0.76.6。不代表整个范围或两个端点已通过原生构建。 |
| Expo Go | 不支持，缺少所需自定义原生模块。 |
| Expo development build / Router / 其他入口 / 旧架构 | 本次交付未验证，不提供猜测性的自动迁移步骤。 |

候选原生基线为 iOS 15.1 / Android minSdk 24。遵循现有 App 更严格的平台与 Node 要求（RN 0.85.1 Demo 需要 Node >=22.11）；Toolkit CLI 本身需要 Node >=20。

## 2. 安装依赖并重新构建

在 App 项目根目录使用其 npm lockfile：

```sh
npm install react-native-debug-toolkit@4.1.1 react-native-mmkv@4.3.2 react-native-nitro-modules@0.35.10 @react-native-clipboard/clipboard@1.16.3
cd ios
pod install
cd ..
```

Toolkit 使用 MMKV 4.3.2，必需 Nitro 0.35.10。两者在 App 显式声明以供原生自动链接识别。Clipboard 是运行时可选能力，上述命令为手机复制安装它；缺少原生能力时 phone 返回 unavailable，Console/Hub 仍可用。关闭 History 不能绕过 MMKV 原生依赖。使用标准 autolinking，不链接本仓库目录。

依赖变化后执行 App 原有 iOS/Android 构建命令，通常 npm run ios 或 npm run android。仅重载 Metro 不够；Pod 安装和 autolinking 成功仅证明配置，不等于原生构建通过。

## 3. 根组件只包装一次

修改前完整 App.tsx：

```tsx
import React from 'react';
import { Text } from 'react-native';

export default function App() {
  return <Text>My App</Text>;
}
```

修改后完整 App.tsx：

```tsx
import React from 'react';
import { Text } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';

function App() {
  return <Text>My App</Text>;
}
export default withDebugToolkit(App);
```

保留原 index.js 注册，例如：

```js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

“一行接入”指安装与原生构建之后的一行根包装，默认注册全部十二页：Network、Console、Native、State、Navigation、Track、Connect、Clipboard、History、Environment、Accounts、Custom。没有状态源、账号、环境、ref、自定义组件时显示正常空页，不要编造业务数据填空。

需要业务绑定时，把完整 [App.tsx](examples/integration/App.tsx)、[debug.config.tsx](examples/integration/debug.config.tsx)、[source.ts](examples/integration/source.ts)、[Verification.tsx](examples/integration/Verification.tsx) 放在同一个目录。示例包括本地演示身份（不是远程认证）、共享外部 store、App 内 Context Provider、source 自定义页和真实请求验证。将演示切换操作替换为实际认证逻辑。配置通过 import 传入，SDK 不自动扫描文件。

## 4. 启动现有 Hub，验证本次运行

在 App 根目录另开终端：

```sh
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit hub dev
```

电脑打开 http://127.0.0.1:3800。Debug 默认使用原生应用标识；Connect 地址优先级为已保存手动地址 > 配置 endpoint > Debug 通过 Metro/平台候选发现。显式地址不可达会报错，不偷偷连接别的 Hub；清除手动地址可恢复配置/自动发现。真机使用电脑可达的局域网地址，手机 localhost 指手机自身；CLI 也会尝试 Android adb reverse。

打开悬浮工具箱，核对十二页。在采集 ready 后生成一条新的 Console 唯一标记和真实 HTTP 请求。Verification 组件等待 debug.ready()，接收业务可达且无副作用的 health/test URL，生成 integration-时间戳-随机值，并把同一标记放进 query。请输入不含 URL fragment 的地址。界面展示真实 HTTP 状态或失败，不伪造成功。

Hub 选择当前 App、Session，在 Console 与 Network 搜索标记，核对 URL、真实响应。记录 appId、sessionId、平台/构建身份和标记。零配置无法取得原生 App 标识时，本地面板仍可用；按配置参考补充稳定的 connect.appId。

```sh
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit diagnose --json
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit status
```

已有 context/inspect/tail 可查询证据，目标参数见 debug-toolkit <command> --help。Hub /ready 只证明服务器就绪，旧会话或旧日志不证明当前 App 接入成功。分别报告依赖/静态检查、原生构建、当前面板、当前会话收到事件这四层证据。

## 5. 初始化、Release 与排障

debug.ready() 描述本地初始化及每个 feature 的能力状态。在普通 useEffect 或挂载后的用户动作中等待，不能在模块顶层、render 或更早的子 layout effect 中等待。未挂载返回 not_started，关闭返回 disabled，卸载取消未完成任务，初始化限时 10 秒。本地 ready 不依赖 Hub 在线。empty 是正常状态，unavailable/error 有明确原因；ready 前的显式记录是 no-op，不补采更早启动流量。

Release 默认关闭。内部 Release 显式 enabled: true 后，Connect 仍不自动发现或上传，需要手动上传一次或开始实时日志。不应运行工具箱的构建设置 enabled: false；这不会从二进制中移除原生代码。

无悬浮入口时检查构建模式和 enabled；空页检查真实业务绑定或生成事件；错误页按字段路径或能力原因修复。原生模块错误需检查安装/自动链接并重新构建。Hub 问题检查设备到电脑连通性及适用的 HTTP/ATS/局域网权限，保留 App 安全策略。详见[环境与 CLI 排障](setup.zh-CN.md)、[配置参考](configuration.zh-CN.md)。

交给 AI 的工作要求：读当前已安装包的 README 和 docs/integration.zh-CN.md，定位原注册处，保留业务结构，只加一个模块级包装，使用真实数据源，完成构建，再生成新标记与请求，分四层报告验证。文档可从 node_modules/react-native-debug-toolkit 读取并与版本对应，不需要内部实现或接入 Skill。

