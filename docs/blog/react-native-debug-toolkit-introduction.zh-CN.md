# 让 AI 读到 App 实时日志，结合源码定位问题

把 React Native 项目交给 AI，它能读源码，却未必知道 App 刚才发生了什么。

比如点击结账后页面报错。AI 可以找到结账代码，但开发者还得补充这次请求的参数和接口返回的内容，说明购物车状态有没有更新。于是排查变成了反复复制日志、粘贴响应，再让 AI 接着看。

React Native Debug Toolkit 把 App 的运行日志接给 AI 编程助手。开发者在手机上复现，助手从本地 Hub 读取这次操作的记录，再对照仓库源码定位问题。

## AI 拿到日志后，能多知道什么

源码描述了程序的处理逻辑，这次操作实际收到了什么数据、执行前后发生了哪些变化，需要运行记录来确认。

| 运行记录 | AI 可以据此检查什么 |
| --- | --- |
| Network | 实际请求参数、响应正文和状态码，对应哪段接口调用及错误处理 |
| Console / Native | JS 输出和支持采集的原生日志，是否与报错代码对应 |
| State | 状态更新前后的值，是否符合代码预期 |
| Navigation | 实际跳转到了哪个页面，前后路由是什么 |
| Track | 业务埋点是否触发，属性是否正确 |

以仓库 Demo 的结账失败为例，请求返回 HTTP 409，响应 JSON 给出了库存不足的信息。拿到这些记录后，AI 可以从结账请求的调用处检查错误处理，再结合状态记录核对购物车的变化。单独一个“结账失败”的描述，很难提供这些线索。

日志和源码放在一起，AI 才能把这次失败对应到具体数据和处理分支。开发者也能查看它引用的记录，复核定位结果。

![在 App 内复现结账失败并同步日志](../../demo.gif)

## AI 怎样获取 App 的实时日志

数据从 App 传到本地 Hub，再由 AI 通过 CLI 查询。

App 内的 Network 模块观察 RN XMLHttpRequest，Console 采集 JS 输出。状态、导航和埋点通过对应 API 接入。HubClient 从日志快照里取出新增条目，带上序列号批量上传；Hub 确认接收后清理已确认的事件，断线时重试。

Hub 运行在开发者电脑上，按 App 和设备会话保存记录。浏览器可以查看这些日志，AI 则通过只读 CLI 读取，不需要操作手机面板或识别截图。

| CLI 命令 | 作用 |
| --- | --- |
| `diagnose` | 发现 Hub，确定 App 和会话，取得诊断上下文 |
| `context` | 读取指定范围的日志摘要 |
| `inspect` | 展开一条记录，查看具体字段 |
| `tail` | 在复现过程中继续读取新事件 |

项目提供的 Skill 告诉 AI 怎样使用这些命令。它会引导助手先选择目标会话，再读取摘要，按需展开与问题有关的记录。日志不完整时，需要标明缺少什么，避免把“没采集到”当成“没发生”。

Toolkit 本身不调用 AI API。它把运行数据提供给已有的编程助手，无需配置 MCP，也不要求账号或云端日志服务。

![浏览器与 AI 查询同一个 Hub 中的运行记录](../media/hub.gif)

## 接入后，复现一次就能开始问

安装依赖，iOS 项目执行 `pod install`。

```sh
npm install react-native-debug-toolkit
cd ios && pod install
```

用 `DebugView` 包裹现有根组件，把 `AppContent` 换成自己的组件，`appId` 换成固定的应用标识。

```tsx
import { DebugView } from 'react-native-debug-toolkit';

export default function App() {
  return (
    <DebugView
      features={{ devConnect: { appId: 'com.example.myapp' } }}
    >
      <AppContent />
    </DebugView>
  );
}
```

重新构建 App，然后在业务项目根目录启动 Hub，保持这个终端运行。

```sh
npx --package=react-native-debug-toolkit debug-toolkit hub dev
```

Debug 构建会通过 Metro 尝试发现 Hub 并上传日志。真机需要能访问电脑的局域网地址，可以在[本地 Web Console](http://127.0.0.1:3800) 确认记录是否到达。

另开终端，在业务项目根目录安装 AI Skill。

```sh
npx --package=react-native-debug-toolkit debug-toolkit init
```

命令会生成 `.agents/skills/react-native-debug-toolkit/SKILL.md` 并更新 `AGENTS.md`。把它们提交到业务仓库，让编程助手加载这些指令并能访问 Hub。

现在在手机上复现问题，再告诉 AI：

> 看一下刚才结账为什么失败，结合运行日志定位相关代码。

助手便可以查询这次操作的日志，继续在源码中检查。需要自己确认某个响应时，也能在 App 悬浮面板或浏览器里打开同一条记录。环境切换和测试账号功能可以辅助复现，自定义 Tab 则用来查看业务快照。

## 从 Demo 开始试

[Demo](../../Demo/README.md) 带有本地购物 API。启动后点 **Run failed checkout**，触发库存不足的 409 响应，再让 AI 查询刚才的失败。切到 Staging，点 **Try successful request**，还能看到返回 201 的请求进入 Hub。业务数据是示例，请求经过真实的 RN 网络链路。

Network 和 Console 在初始化后自动采集，状态与埋点等业务记录需要接入。网络采集限于 RN XHR 链路，部分 fetch 实现只能提供 Blob 元数据；缓冲和事件大小限制也可能造成记录缺失。定位是否准确，仍取决于相关日志是否齐全，以及分析是否与源码吻合。

Toolkit 用于 Debug 和内测构建。Expo 需要 development build；内测 Release 包需显式启用 Toolkit 并手动开启上传，公开生产包应关闭。日志默认不脱敏，Hub 只在可信网络使用，交给 AI 前检查敏感信息。

[GitHub 仓库](https://github.com/superzcj/react-native-debug-toolkit) · [接入与排障](../setup.zh-CN.md) · [功能示例](../usage.zh-CN.md)
