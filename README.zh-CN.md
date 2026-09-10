# React Native Debug Toolkit

**App 内调试，浏览器看日志，AI 根据运行证据定位问题。**

[English](README.md) · [体验 Demo](Demo/README.md) · [接入说明](docs/setup.zh-CN.md) · [功能示例](docs/usage.zh-CN.md)

- **App 内面板：**悬浮查看请求、日志和状态变化。
- **本地 Hub：**在浏览器实时查看设备日志、搜索并展开请求详情。
- **AI 排查：**仓库 Skill 让编程助手读取运行证据并追踪代码，无需配置 MCP。

<p align="center"><img src="demo.gif" width="360" alt="触发结账失败，查看真实 HTTP 409 响应。" /></p>

## 快速接入

安装后重新构建原生 App：

```sh
npm install react-native-debug-toolkit
cd ios && pod install
```

包裹现有根组件，填入 App 的固定标识：

```tsx
import { DebugView } from 'react-native-debug-toolkit';

export default function App() {
  return (
    <DebugView features={{ devConnect: { appId: 'com.example.myapp' } }}>
      <AppContent />
    </DebugView>
  );
}
```

点击悬浮入口即可检查日志。Expo 请使用 development build，不支持 Expo Go。

## 连接浏览器与 AI

在业务 App 根目录启动 Hub：

```sh
npx --package=react-native-debug-toolkit debug-toolkit hub dev
```

打开 [localhost:3800](http://127.0.0.1:3800/)。Debug 构建通过 Metro 自动发现 Hub 并上传；真机使用电脑可达的局域网地址。

![查看失败响应，再实时收到成功请求](docs/media/hub.gif)

安装一次 AI Skill：

```sh
npx --package=react-native-debug-toolkit debug-toolkit init
```

提交生成的 Skill 和 `AGENTS.md` 改动。在能加载它们的编程助手中，复现问题后直接说：

> 看一下刚才结账为什么失败，结合运行日志定位相关代码。

## 更多功能

[功能示例](docs/usage.zh-CN.md)：Zustand 状态、导航、埋点、环境切换、测试账号、历史会话和自定义 Tab。

[运行 Demo](Demo/README.md)，用示例购物数据体验真实的 HTTP 409 → 201 流程。

用于 Debug/内测构建。Release 需在 Connect 手动开启上传；公开生产包保持关闭。Hub 仅在可信网络使用，日志默认不脱敏。[配置与排障](docs/setup.zh-CN.md) · [MIT](LICENSE)
