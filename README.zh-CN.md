# React Native Debug Toolkit

这是一个给 React Native 排查运行时问题的工具。最常用的方式是在开发者自己的 Mac 上启动 Hub，App 把日志发到这里，AI 通过仓库里的 Skill 读取；Hub 网页供人手工查看。多人要共用一处日志时，才在 Mac mini 上部署公共 Hub。

[English](README.md)

## 先按场景选命令

| 要做什么                         | 在哪里执行 | 命令                                                                                  |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| 在自己的 Mac 上调试 App（常用）  | App 根目录 | `npx debug-toolkit hub dev`                                                           |
| 开发本仓库，启动 Hub             | 仓库根目录 | `npm run hub`                                                                         |
| 跑 iOS Demo                      | 仓库根目录 | `npm run demo:ios`                                                                    |
| 跑 Android Demo                  | 仓库根目录 | `npm run demo:android`                                                                |
| 为本仓库生成 AI Skill            | 仓库根目录 | `npm run ai:init`                                                                     |
| 在 Mac mini 安装公共 Hub（可选） | Mac mini   | `npx -y react-native-debug-toolkit@4.0.0 hub install --url http://<mac-mini-ip>:3800` |
| 更新公共 Hub                     | Mac mini   | `npx -y react-native-debug-toolkit@<版本号> hub update`                               |
| 为业务 App 生成 AI Skill         | App 根目录 | `npx debug-toolkit init`                                                              |

`npm run hub`、`npm run demo:ios`、`npm run demo:android` 和 `npm run ai:init` 都写在本仓库根目录的 `package.json`。业务 App 不会有这些脚本，请用 `npx debug-toolkit ...`。

## 在本机启动 Hub

这是调试业务 App 的默认方式。在 App 根目录执行：

```bash
npx debug-toolkit hub dev
```

Hub 会以前台方式运行在 `3800` 端口，数据放在 `.debug-toolkit/hub`，并输出 loopback 和局域网地址。Debug 包可以从 Metro bundle host 自动发现 Hub；`features.devConnect.endpoint` 是 Release 默认值，也是 Debug 自动发现失败后的回退地址。

结束时按 `Ctrl+C` 停止 Hub。检测到 Android 设备或模拟器时，`hub dev` 会尽力执行 `adb reverse tcp:3800 tcp:3800`，失败只提示，不影响启动。

## 本仓库怎么跑

在仓库根目录开两个终端：

```bash
npm run hub
```

```bash
npm run demo:ios
# 或：npm run demo:android
```

Hub 监听 `3800` 端口，开发数据放在 `.debug-toolkit/hub`。Demo 当前发往 `http://172.31.23.124:3800`。浏览器打开这个地址，操作 Demo，Hub 中应出现设备和日志。

这个地址必须是调试 Mac 的局域网 IP。真机不能填 `127.0.0.1`。如果 Mac 地址变了，先改 Demo 的配置再测试。

完整步骤见 [Demo/README.md](Demo/README.md)。

## 接入业务 App

```bash
npm install react-native-debug-toolkit
cd ios && pod install
```

Expo Go 不能加载原生模块，请使用 development build、prebuild 或 bare React Native。

`appId` 直接复用 App 已有的固定标识。Debug 包可以不填 `endpoint`，靠自动发现；显式开启 Toolkit 的 Release/内测包必须提供 `endpoint`：

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

## 可选：在 Mac mini 上运行公共 Hub

只有多人需要共用一个 Hub 时才需要这一步。Mac mini 使用固定局域网地址后，执行一次：

```bash
npx -y react-native-debug-toolkit@4.0.0 hub install \
  --url http://10.20.4.10:3800
```

一个 URL 就够了，地址和端口都从它取。服务会在 Mac 重启后自动启动，即使没有用户登录。数据在 `/Users/Shared/ReactNativeDebugToolkitHub/data`，保留 7 天，总量最多 20 GB；满了以后不再接收新日志。

升级时明确写要运行的版本：

```bash
npx -y react-native-debug-toolkit@4.1.0 hub update
```

Hub 不会自己升级。公网地址变更时，用新的 `--url` 再执行一次 `hub install`。

第一版没有鉴权、TLS 和脱敏。只在公司可信局域网或 VPN 中使用，不能暴露到公网。

## 让 AI 看日志

在业务 App 的根目录执行一次：

```bash
npx debug-toolkit init
```

它会创建 `.agents/skills/react-native-debug-toolkit/SKILL.md`，并在 `AGENTS.md` 写入一条发现指令。把这两个文件提交到仓库。

之后直接描述问题，例如：

```text
看一下刚才登录为什么失败
```

Skill 会读取 `devConnect` 配置，找到对应 Session，再查看相关日志。多台设备同时在线时，AI 会问你要看哪一台。本机 Hub 时，直接在这台 Mac 上运行 AI；公共 Hub 时，通过公司局域网或 VPN 访问。

需要手工查询时，仍可以使用 `status`、`context`、`inspect` 和 `tail`。

## Hub 网页

在浏览器打开 Hub 地址，例如本机的 `http://172.31.23.124:3800/`，或公共 Hub 的 `http://10.20.4.10:3800/`。选择 App 和设备后，可以过滤、搜索和查看日志详情。它主要给人辅助排查，AI 用 Skill 读取。

## 包含的内容

- App Toolkit：Console、Network、Native、Navigation、Track、Zustand、Environment、Clipboard 和自定义 Tab。
- Hub：Node 服务、JSONL 存储和网页。日志保留 7 天，总量最多 20 GB。
- AI：仓库 Skill 和只读 CLI，不需要 MCP。

## 边界

- 这是调试工具，不是线上监控，也不替代 React Native DevTools。
- 默认不脱敏。
- Network 只记录请求证据，不能自行判断业务或鉴权失败的原因。

## License

MIT
