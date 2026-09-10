# React Native Debug Toolkit

**从 App 里的一次操作，追到问题背后的运行证据。**

[English](README.md) · [体验 Demo](Demo/README.md) · [接入指南](docs/setup.zh-CN.md) · [功能示例](docs/usage.zh-CN.md)

为 React Native 提供一套运行时调试工具：在 App 内检查请求、日志和状态，在本地浏览器跟踪设备活动，再让 AI 编程助手结合相同的运行证据分析代码。

手机上复现，电脑上查看，交给 AI 继续定位。

<p align="center"><img src="demo.gif" width="380" alt="复现结账失败，查看 HTTP 响应、状态、埋点、环境切换和日志同步。" /></p>

<p align="center"><sub>请求响应、状态、埋点、环境切换、文本传递与日志同步，约 18 秒。</sub></p>

## 三种排查方式，串起同一次操作

| 在哪里排查 | 能帮你做什么 |
| --- | --- |
| **App 内** | 悬浮面板集中展示请求、控制台和状态变化，真机复现时就能直接检查。 |
| **浏览器里** | 本地 Hub 汇集设备会话，支持搜索日志、展开请求详情；操作 App 时，新事件实时进入列表。 |
| **AI 编程工具里** | 仓库 Skill 配合只读 CLI，让编程助手读取运行证据并结合源码排查，直接描述现象即可开始。 |

无需账号或云端日志服务。Hub 运行在自己的电脑上，AI 通过仓库 Skill 接入，无需配置 MCP。

![Web 端查看同步日志、Staging 请求、埋点属性和手机传来的文本](docs/media/hub.gif)

**把设备上的信息带到电脑：**手机操作产生的日志自动汇集到 Hub；需要传一段调试文本时，在 Clip 输入后点 Copy，电脑端 Console 即可查看、复制。

## 覆盖日常调试的关键环节

| 功能 | 可以检查或控制什么 |
| --- | --- |
| **Network** | 请求状态、耗时、请求头与请求/响应正文 |
| **Console / Native** | 集中查看 JS 输出和支持采集的原生日志 |
| **状态变化** | Zustand 动作及前后状态，也可显式记录其他状态方案 |
| **Navigation 导航** | 页面跳转、前后路由与耗时 |
| **Track 埋点** | 核对埋点名称、属性和触发时间，检查是否按预期触发 |
| **自定义 Tab** | 展示项目自己的实时快照，例如购物车、功能开关、用户上下文 |
| **环境切换** | 在配置的开发/测试环境间切换，替换 API host 或 URL 前缀并保存选择 |
| **手机 → Mac 文本传递** | 通过 Clip/Copy 把文本写入 Console，在 Mac 的 Hub 中查看、复制 |
| **日志同步** | 将请求、JS/原生日志、状态、导航和埋点同步到本地 Hub；支持上传一次与持续同步 |
| **测试账号 / 历史会话** | 接入业务账号切换，回看保留的历史日志 |

Network 和 Console 在初始化后自动采集；状态、导航、埋点及业务工具按需接入。[查看示例与采集范围 →](docs/usage.zh-CN.md)

## 快速接入

### 加入 App 内面板

```sh
npm install react-native-debug-toolkit
cd ios && pod install
```

包裹现有根组件，将 `appId` 换成 App 的固定标识：

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

重新构建原生 App，点击悬浮入口即可检查。单独使用 App 内面板无需启动 Hub。Expo 请使用 development build，不支持 Expo Go。

### 连接浏览器与 AI

在业务 App 根目录启动 Hub：

```sh
npx --package=react-native-debug-toolkit debug-toolkit hub dev
```

打开 [localhost:3800](http://127.0.0.1:3800/)。Debug 构建通过 Metro 自动发现 Hub 并上传；真机需使用电脑可达的局域网地址。

安装一次 AI Skill：

```sh
npx --package=react-native-debug-toolkit debug-toolkit init
```

提交生成的 `.agents/skills/react-native-debug-toolkit/SKILL.md` 和 `AGENTS.md` 改动。在能加载它们并访问 Hub 的编程助手中，复现问题后直接说：

> 看一下刚才结账为什么失败，结合运行日志定位相关代码。

Toolkit 提供运行证据，AI 编程助手负责分析。[连接配置、构建模式与排障 →](docs/setup.zh-CN.md)

## 用一次真实请求体验

[Demo](Demo/README.md) 自带本地购物 API：触发库存不足，查看 **HTTP 409 与 JSON 响应**，跟踪 **状态和埋点**，切换到 **Staging 环境**再发起请求，观察 **201 实时进入 Hub**，最后用 Clip 传一段文本到电脑。业务数据为示例，请求经过真实的 React Native 网络链路。

用于 Debug/内测构建。Release 需在 Connect 手动开启上传，公开生产包保持关闭。Hub 仅在可信网络使用，分享前检查日志内容；日志默认不脱敏。

[MIT 许可证](LICENSE)
