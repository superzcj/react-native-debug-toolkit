# 配置与排障

[快速接入](../README.zh-CN.md) · [English](setup.md) · [Demo](../Demo/README.md)

## 原生依赖

- 安装 `react-native-debug-toolkit`，iOS 执行 `pod install` 后重新构建。
- 使用 bare React Native 或 Expo development build。Toolkit 自带独立 MMKV 存储，无需业务存储适配器。
- Debug/内测包需允许 HTTP 访问 Hub：检查 iOS ATS/本地网络权限和 Android cleartext 配置。

## 连接与构建模式

```tsx
<DebugView
  enabled={__DEV__ || appConfig.buildChannel === 'internal'}
  features={{ devConnect: {
    appId: appConfig.appId,
    endpoint: appConfig.debugLogHubUrl,
  } }}
>
  <AppContent />
</DebugView>
```

替换成项目自己的构建配置和根组件。`endpoint` 可省略：Debug 优先通过 Metro 发现 Hub，失败时回退到配置地址；Release 将它作为默认地址。

| 构建 | 行为 |
| --- | --- |
| Debug | 默认启用，配置 `devConnect.appId` 后自动发现并上传 |
| 内测 / Release | 显式启用后，在 Connect 点 **Upload Once** 或 **Start Live Logs** |
| 公开生产包 | 设置 `enabled={false}` |

Connect 支持 IPv4 网段、末段和端口输入，并保留有效的手动地址。真机填写电脑局域网 IP，不能填 `127.0.0.1`。`hub dev` 还会尝试通过 `adb reverse` 转发 Android 端口。

## AI Skill 与 CLI

在业务 App 根目录执行，另一个终端保持 Hub 运行：

```sh
npx --package=react-native-debug-toolkit debug-toolkit init
npx --package=react-native-debug-toolkit debug-toolkit diagnose --json
```

`init` 生成 `.agents/skills/react-native-debug-toolkit/SKILL.md` 并更新 `AGENTS.md`，将两者提交到仓库。AI 工具需能加载指令并访问本机 Hub；库本身不调用 AI API。

| 命令 | 用途 |
| --- | --- |
| `init --check` / `init --update` | 检查或更新托管 Skill，更新时保留备份 |
| `diagnose --json` | 发现 Hub 和运行证据；多个候选时选择目标 |
| `status` / `context` / `inspect` / `tail` | 查询目标、摘要、详细记录或实时事件 |

## 没有日志时

1. 在电脑检查 `http://127.0.0.1:3800/ready`，确认 App 也能访问 Hub。
2. 检查 `enabled`、`devConnect.appId` 和 Connect 地址；Release 需手动上传。
3. 在 Toolkit 初始化后复现，并在 Hub 选择当前 App/会话。
4. 响应正文或原生日志为空时，检查[采集范围](usage.zh-CN.md)。

## 数据

Hub 日志保存在 `.debug-toolkit/hub`，保留 7 天、总量上限 20 GB。仅用于可信网络，日志默认不脱敏。分享给 AI 服务商的日志遵循该服务商的数据规则。结束后按 Ctrl+C 停止 Hub。
