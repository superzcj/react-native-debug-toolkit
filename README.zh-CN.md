# React Native Debug Toolkit

React Native 完整 App 内调试面板与本地运行日志 Hub。

[English](README.md) · [接入指南](docs/integration.zh-CN.md) · [配置参考](docs/configuration.zh-CN.md) · [Demo](https://github.com/superzcj/react-native-debug-toolkit/blob/main/Demo/README.md)

## 一行根包装，默认全部功能

在现有 React Native CLI App 安装包与原生依赖：

```sh
npm install react-native-debug-toolkit@4.1.1 react-native-mmkv@4.3.2 react-native-nitro-modules@0.35.10 @react-native-clipboard/clipboard@1.16.3
cd ios
pod install
cd ..
```

完整 App.tsx 示例；已有 App 应用最后一行包装：

```tsx
import React from 'react';
import { Text } from 'react-native';
import { withDebugToolkit } from 'react-native-debug-toolkit';

function App() {
  return <Text>My App</Text>;
}
export default withDebugToolkit(App);
```

使用 App 原有 iOS/Android 命令重新构建。安装、Pods、原生重编译仍需执行，“一行”指根包装。HOC 放模块作用域，保留 AppRegistry，同时只挂载一个宿主。

| 默认页面 | 没有业务配置时 |
| --- | --- |
| Network / Console / Native | 初始化后采集受支持事件，原生能力显示真实状态 |
| State / Navigation / Track | 正常空页，等待 source、ref 或显式事件 |
| Connect | 原生 App 标识与 Debug 发现；无 Hub 仍可用本地页 |
| Clipboard | 用户触发文本操作；可选原生剪贴板只影响手机复制 |
| History | 已保留的 Network/Console/Native/Track 日志 |
| Environment / Accounts / Custom | 正常空页，等待真实业务数据或组件 |

这是完整工具箱，无需功能清单或十二个 enabled 开关。各功能用对象补数据，例如 `withDebugToolkit(App, { locale: 'zh-CN', network: { maxLogs: 100 } })`。显式 `{ enabled: false }` 才关闭功能。[全部字段及 source/Context/账号示例](docs/configuration.zh-CN.md)。

## 连接与验证

在 App 根目录运行：

```sh
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit hub dev
```

电脑打开[本地 Hub](http://127.0.0.1:3800/)。Debug 可自动发现/上传，真机需使用可达电脑地址。ready 后生成新的唯一 Console 标记和真实 HTTP 请求，在 **当前 App 和 Session** 找到两者。[具体验证步骤](docs/integration.zh-CN.md)。

Release 默认关闭；显式开启的内部 Release 仍需上传一次/开始实时日志，不自动发现或上传。初始化前事件不补采。[生命周期、磁盘容量、复制分通道结果](docs/configuration.zh-CN.md)。

## 让 AI 帮忙接入

让助手读当前已安装包的[接入指南](docs/integration.zh-CN.md)、[配置参考](docs/configuration.zh-CN.md)、[完整示例](docs/examples/integration/App.tsx)，定位根入口，只包装一次，绑定真实数据，重新构建并验证本次会话新标记。接入无需 Skill 或内部源码知识。

已有 Hub/CLI 的 diagnose --json、status、context、inspect、tail 可查询运行证据。可选已有诊断 Skill 用 debug-toolkit init 管理，与 App 接入分开。[CLI 说明](docs/setup.zh-CN.md)。

## Demo 与支持范围

[Demo](https://github.com/superzcj/react-native-debug-toolkit/blob/main/Demo/README.md) 包括零业务配置和完整 Showcase：真实 HTTP 409/201、环境、状态/埋点、本地账号身份及复制结果。

已验证入口为 RN CLI/npm：RN 0.85.1 独立包安装、类型、renderer、autolinking、Pod 安装已检查，原生构建/设备验收仍需单独验证。RN 0.76.6–0.85.1 为候选范围，不代表各版本原生构建通过。Expo Go 不支持，其他入口未验证。[支持边界](docs/integration.zh-CN.md)。

Hub 本地运行，无需云账号。日志默认不脱敏，分享前检查。[MIT](LICENSE)。
