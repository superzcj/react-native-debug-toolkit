# 连接与排障

[接入指南](integration.zh-CN.md) · [配置参考](configuration.zh-CN.md) · [English](setup.md)

原生安装、根注册与当前会话验证见[接入指南](integration.zh-CN.md)。SDK 配置统一放入传给 withDebugToolkit 的对象。

## 构建与地址

| 构建 | 行为 |
| --- | --- |
| Debug | 默认启用，原生身份，可自动发现/上传 |
| Release | 默认关闭；显式开启后仍需上传一次/开始实时日志 |
| enabled: false | 无运行时采集/页面；原生依赖仍在 |

地址优先级：已保存手动地址 > connect.endpoint > Debug 发现。显式地址不可达不偷偷回退。缺原生身份时 Connect 不可用，可补 connect.appId。原生身份/发现正常时两字段都无需填写。

Connect 支持 IPv4 前缀、末段与端口，保留有效手动地址。真机填电脑局域网 IP，而非手机 localhost。hub dev 也会尝试 Android adb reverse。HTTP 开发网络检查适用的 iOS ATS/局域网权限与 Android cleartext 设置，保留 App 安全策略。

## 现有 Hub 与 CLI

在 App 根目录运行：

```sh
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit hub dev
```

另开终端：

```sh
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit diagnose --json
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit status
```

| 命令 | 用途 |
| --- | --- |
| diagnose --json | 发现运行证据，多个候选时选择目标 |
| status / context / inspect / tail | 查询目标、摘要、记录或实时事件 |
| init / init --check / init --update | 可选已有运行诊断 Skill，更新保留备份 |

可选 init 创建 .agents/skills/react-native-debug-toolkit/SKILL.md 并更新 AGENTS.md，用于运行诊断。AI 接入 App 读取公开文档，无需 init。工具箱不调用 AI API。

Hub 语言独立于 SDK locale：

```sh
npx --package=react-native-debug-toolkit@4.1.1 debug-toolkit hub dev --locale zh-CN
```

hub start 也支持此参数；DEBUG_TOOLKIT_HUB_LOCALE 同样可用，命令行优先。Hub auto 使用浏览器语言；更改后重启 Hub 并刷新。

## 没有当前日志？

1. 电脑检查 http://127.0.0.1:3800/ready，确认 App 可达。
2. 检查构建模式/enabled、实际 Connect 身份与地址。Release 手动上传。
3. ready 后生成新唯一标记与真实请求，选择当前 App/Session。
4. 缺业务数据是空态，能力不可用/错误会说明原因。
5. 核对[采集边界](configuration.zh-CN.md)。旧日志或 Hub 健康不能证明本次运行。

Hub 数据在 .debug-toolkit/hub，保留 7 天、总量 20 GB。日志默认不脱敏。前台 Hub 用 Ctrl+C 停止。
