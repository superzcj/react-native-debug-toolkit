# React Native Debug Toolkit

这是一个给 React Native 排查运行时问题的工具。在开发者自己的 Mac 上启动 Hub，App 把日志发过去，AI 通过仓库里的 Skill 读取；Hub 网页供人手工查看。

[English](README.md)

## 先按场景选命令

| 要做什么                        | 在哪里执行 | 命令                         |
| ------------------------------- | ---------- | ---------------------------- |
| 在自己的 Mac 上调试 App（常用） | App 根目录 | `npx --package=react-native-debug-toolkit debug-toolkit hub dev` |
| 开发本仓库，启动 Hub            | 仓库根目录 | `npm run hub`                |
| 跑 iOS Demo                     | 仓库根目录 | `npm run demo:ios`           |
| 跑 Android Demo                 | 仓库根目录 | `npm run demo:android`       |
| 为本仓库生成 AI Skill           | 仓库根目录 | `npm run ai:init`            |
| 为业务 App 生成 AI Skill        | App 根目录 | `npx --package=react-native-debug-toolkit debug-toolkit init` |

`npm run hub`、`npm run demo:ios`、`npm run demo:android` 和 `npm run ai:init` 都写在本仓库根目录的 `package.json`。`react-native-debug-toolkit` 是 npm 包名，`debug-toolkit` 是 bin 名；业务 App 请用 `npx --package=react-native-debug-toolkit debug-toolkit ...`。

## 在本机启动 Hub

这是调试业务 App 的默认方式。在 App 根目录执行：

```bash
npx --package=react-native-debug-toolkit debug-toolkit hub dev
```

Hub 会以前台方式运行在 `3800` 端口，数据放在 `.debug-toolkit/hub`，并输出 loopback 和局域网地址。Debug 包可以从 Metro bundle host 自动发现 Hub；`features.devConnect.endpoint` 可选，用作 Release 默认值，也是 Debug 自动发现失败后的回退地址。

结束时按 `Ctrl+C` 停止 Hub。检测到 Android 设备或模拟器时，`hub dev` 会尽力执行 `adb reverse tcp:3800 tcp:3800`，失败只提示，不影响启动。

如果团队自行在另一台长期在线电脑上运行同一命令，App 可以通过 `endpoint` 连接；进程守护、开机启动、升级和网络安全由使用者自己的运行环境负责，不属于 Toolkit 首版功能。

## 本仓库怎么跑

在仓库根目录开两个终端：

```bash
npm run hub
```

```bash
npm run demo:ios
# 或：npm run demo:android
```

Hub 监听 `3800` 端口，开发数据放在 `.debug-toolkit/hub`。浏览器打开终端打印的局域网地址，操作 Demo，Hub 中应出现设备和日志。

真机必须能从局域网访问 Hub，不能填 `127.0.0.1`。

完整步骤见 [Demo/README.md](Demo/README.md)。

## 接入业务 App

```bash
npm install react-native-debug-toolkit
cd ios && pod install
```

Expo Go 不能加载原生模块，请使用 development build、prebuild 或 bare React Native。

`appId` 直接复用 App 已有的固定标识。Debug 包可以不填 `endpoint`，靠自动发现；Release/内测包可以配置 `endpoint`，也可以在 Connect 页输入当前可达的 Hub 地址：

```tsx
import { DebugView } from "react-native-debug-toolkit";

<DebugView
  enabled={__DEV__ || appConfig.buildChannel === "internal"}
  features={{
    console: true,
    network: true,
    devConnect: {
      appId: appConfig.appId,
      endpoint: appConfig.debugLogHubUrl,
    },
  }}
>
  <AppContent />
</DebugView>;
```

如果 App 已经拥有持久化存储，向 Toolkit 传入同一个 `StorageAdapter` 用于日志和
界面偏好。这样无需仅为 Toolkit 安装可选存储 peer：

```tsx
const debugStorage = {
  getItem: (key: string) => appStorage.getString(key) ?? null,
  setItem: (key: string, value: string) => appStorage.set(key, value),
  removeItem: (key: string) => appStorage.remove(key),
};

<DebugView logStorage={debugStorage} preferenceStorage={debugStorage}>
  <AppContent />
</DebugView>;
```

Connect 页面保留一个地址输入框、"上传一次" 和 "开启/停止实时日志"。

- Debug 包启动后会解析 Hub、连接并自动上传。
- 内测或 Release 包即使启用了 Toolkit，也要点 "上传一次" 或 "开启实时日志" 才上传。
- 公开生产包设为 `enabled={false}`，不会显示 Toolkit，也不会上传日志。

bare React Native 只在 debug/internal 配置中放开访问内网 HTTP Hub：iOS 配 ATS 和 Local Network，Android 配 cleartext。真机必须能从局域网访问 Hub。

升级包时，安装指定版本并重新构建原生 App：

```bash
npm install react-native-debug-toolkit@<版本号>
cd ios && pod install
```

## 让 AI 看日志

在业务 App 的根目录执行一次：

```bash
npx --package=react-native-debug-toolkit debug-toolkit init
```

它会创建 `.agents/skills/react-native-debug-toolkit/SKILL.md`，并在 `AGENTS.md` 写入一条发现指令。把这两个文件提交到仓库。

之后直接描述问题，例如：

```text
看一下刚才登录为什么失败
```

Skill 会读取 `devConnect` 配置，找到对应 Session，再查看相关日志。多台设备同时在线时，AI 会问你要看哪一台。本机排查时，在同一台 Mac 上运行 AI（优先探测 `http://127.0.0.1:3800`）。

需要手工查询时，仍可以使用 `status`、`context`、`inspect` 和 `tail`。

## Hub 网页

在浏览器打开 Hub 地址，例如 `http://127.0.0.1:3800/` 或终端打印的局域网地址。选择 App 和设备后，可以过滤、搜索和查看日志详情。它主要给人辅助排查，AI 用 Skill 读取。

## 包含的内容

- App Toolkit：Console、Network、Native、Navigation、Track、Zustand、Environment、Clipboard 和自定义 Tab。
- Hub：Node 服务、JSONL 存储和网页。日志保留 7 天，总量最多 20 GB。
- AI：仓库 Skill 和只读 CLI，不需要 MCP。

## 边界

- 这是调试工具，不是线上监控，也不替代 React Native DevTools。
- 默认不脱敏。
- Network 只记录请求证据，不能自行判断业务或鉴权失败的原因。
- 首版只在开发者可信的本机或局域网内运行，不能暴露到公网。

## License

MIT
