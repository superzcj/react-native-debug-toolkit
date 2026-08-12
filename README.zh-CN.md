# React Native Debug Toolkit

面向 AI 的 React Native 运行时证据工具。App 把调试日志上传到公共 Shared Hub；仓库中的 Skill 让 AI 直接读取并诊断。Web Console 仅供人辅助浏览同一份证据。

## 包含什么

- App 内 Toolkit：Console、Network、Native、Navigation、Track、Zustand、环境切换、Clipboard 和自定义 Tab。
- Shared Hub：一台可信局域网 Mac 上的 Node 服务，带 Web Console，保存 7 天、总量 20 GB。
- AI 流程：仓库 Skill → `status`、`context`、`inspect`、有界 `tail`。不需要安装 MCP。

## 1. 安装 App 包

```bash
npm install react-native-debug-toolkit
cd ios && pod install
```

Expo Go 不能加载原生模块，请使用 development build、prebuild 或 bare React Native。

## 2. 在公共 Mac 上安装 Hub

在拥有固定局域网地址的 Mac mini 执行一次：

```bash
npm exec --yes --package=react-native-debug-toolkit@4.0.0 -- \
  debug-toolkit hub install --system \
  --bind 10.20.4.10 \
  --advertise-url http://10.20.4.10:3800
```

系统服务会在重启后自动恢复；数据写在 `/Users/Shared/ReactNativeDebugToolkitHub/data`。日志保留 7 天，达到 20 GB 后不再接收新日志。第一版没有鉴权、TLS 或脱敏，只能部署在可信局域网或 VPN。

只查看安装结果、不写文件：

```bash
debug-toolkit hub install --system --dry-run \
  --bind 10.20.4.10 --advertise-url http://10.20.4.10:3800
```

本地开发 Hub：

```bash
debug-toolkit hub start \
  --bind 10.20.4.10 --port 3800 \
  --data-dir /tmp/react-native-debug-toolkit-hub
```

## 3. 配置 App

继续使用 `DebugView.features.devConnect`。`appId` 直接使用业务 App 已有的固定标识；模拟器和真机都配置 Mac 的局域网 IP，真机不能填 `127.0.0.1`。

```tsx
<DebugView
  enabled={__DEV__ || appConfig.buildChannel === 'internal'}
  features={{
    console: true,
    network: true,
    devConnect: {
      appId: appConfig.appId,
      endpoint: 'http://10.20.4.10:3800',
    },
  }}
>
  <AppContent />
</DebugView>
```

Connect Tab 只有一个 Hub 地址输入框和两个动作：**上传一次**、**开启/停止实时日志**。

- Debug 包启动后自动连接、自动实时上传。
- 显式开启 Toolkit 的内测/Release 包默认不上传；用户点击“上传一次”或“开启实时日志”后才上传。
- 正式生产包应配置 `enabled={false}`，不会采集、连接或显示 Toolkit。

bare React Native 仅在 debug/internal 构建中添加 iOS Local Network / ATS 与 Android cleartext 配置；真机需要能在同一网络打开 Hub 地址。

## 4. 让 AI 读取日志

在 App 仓库根目录生成并提交 Skill：

```bash
npm exec --no --package=react-native-debug-toolkit -- debug-toolkit init-skill
```

AI 会从 `DebugView` 配置读取 App 和 Hub，按 `status → context → inspect` 读取证据。只有一个活跃 Session 时自动读取；多个时展示设备信息并只问用户一次。

AI 必须在可访问公司局域网/VPN 的本地 shell 中运行。

手工只读查询：

```bash
debug-toolkit status --endpoint http://10.20.4.10:3800 --app-id com.example.app
debug-toolkit context --endpoint http://10.20.4.10:3800 --app-id com.example.app --session <session-id>
debug-toolkit inspect <entry-id> --endpoint http://10.20.4.10:3800 --app-id com.example.app
```

## Web Console

浏览器打开 `http://10.20.4.10:3800/console`。可按 App、设备/Session、日志类型、严重级别和关键词查看日志及详情；它是人辅助定位的入口，AI 使用 Skill 与 CLI。

## 原生日志

- Android：采集当前 App 进程可见的 `logcat`。
- iOS：采集 `RCTLog*` 发出的 React Native 原生日志。

原生日志可能包含用户数据、token、URL 或设备状态，公开生产包不要默认开启 Toolkit。

## 边界

- 调试证据工具，不是线上监控或 React Native DevTools 替代品。
- 默认不脱敏。
- Network 只采集请求证据，不会自动判断业务或鉴权问题。

## License

MIT
