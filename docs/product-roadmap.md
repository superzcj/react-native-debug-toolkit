# React Native Debug Toolkit 路线图

更新：2026-05-25

## 定位

旧：App 内浮动调试面板。

新：React Native 本地日志桥。

```text
App logs -> Debug Panel -> local daemon -> Web Console / HTTP API / MCP
```

核心判断：

- Web Console 给人看。
- HTTP API 给 curl、脚本、AI 读。
- MCP 可选，只是 adapter。
- App 内面板不再是主产品，只是采集和同步控制面。

## 当前能力

App 侧：

- Network / Console / Navigation / Track / Zustand
- Environment / Clipboard
- XHR + fetch 捕获
- Desktop Logs：`Send Once` / `Start Live Sync`
- `/health` 预检
- 真机 Mac IP 输入
- daemon 请求 blacklist，避免自污染

Desktop 侧：

- 单 bin：`debug-toolkit`
- daemon：HTTP API + device log store
- Web Console：设备列表、详情、筛选、failed only、复制 JSON、curl 命令、SSE
- 默认 `0.0.0.0:3799`
- 启动打印 `LAN IPs`
- 默认存储：`~/.react-native-debug-toolkit/daemon-devices.json`
- MCP：`list_app_devices`、`get_app_logs`

## 产品面

### 1. Human Console

目标：开发者打开浏览器就能看真机日志。

需要加强：

- Web Console e2e。
- Doctor 页。
- 多设备名称。
- 统一时间线。
- 全局过滤和搜索。

### 2. AI Read Layer

目标：AI 不靠用户截图，不靠用户复制长日志，直接读本地运行证据。

需要加强：

- AI Bundle：失败优先、小上下文、可复现。
- `entryId` 深挖单条详情。
- 关联上下文：失败请求 + console error + navigation + state。
- 可选 redaction。
- MCP `clear_app_logs`。

### 3. Reproduction Layer

目标：从“看见问题”到“复现问题”。

需要加强：

- Network replay。
- Edit replay。
- Mock / delay profile。
- Zustand diff。
- Zustand snapshot restore。

### 4. Team Handoff

目标：把本机证据变成 issue / bug report。

需要加强：

- Report export。
- Issue mode。
- 环境摘要。
- 重现步骤模板。
- 远程上传 hook，但不内置云账号。

## 优先级

### P0：桥稳定

- Web Console browser e2e。
- `debug-toolkit devices`。
- `debug-toolkit logs`。
- Doctor 页：真机连不上时给明确原因。
- Store rotation：限制文件体积、保留设备数、保留天数。

### P1：AI 好读

- AI Bundle。
- Error-first 裁剪。
- 统一设备时间线。
- `entryId` 详情链路强化。
- 可选 redaction 规则。
- MCP `clear_app_logs`。

### P2：问题可复现

- Network replay。
- Edit replay。
- Mock profile。
- Delay profile。
- Zustand diff / restore。

### P3：团队协作

- Issue Mode。
- Report Export。
- Tools Hub。
- 轻量性能视图。
- 远程上传 hook。

## 功能机会

高价值：

- AI Bundle：最贴合新定位。让 AI 直接拿“失败上下文包”，少读无关日志。
- Doctor：真机链路最容易失败，先把失败原因产品化。
- CLI：`devices/logs/clear` 让人和 AI 都少写 URL。
- Timeline：多类日志现在分散，排查跨网络、导航、状态的问题不够顺。

中价值：

- Redaction：新定位涉及 AI 读取，隐私安全迟早要补。
- Report Export：适合团队 bug handoff，但别先做重平台。
- React Query / Redux adapter：可扩采集面，但别抢 P0/P1。

低优先：

- 重桌面客户端。
- 云账号。
- 大而全性能分析。
- 替代官方 DevTools。

## Issue 草案

| # | Issue | 目标 |
| --- | --- | --- |
| 1 | `test: add browser e2e coverage for web console` | 覆盖 report、ingest、SSE、筛选、复制 |
| 2 | `feat: add daemon doctor page for real device setup` | 降低真机联通排查成本 |
| 3 | `feat: add debug-toolkit devices/logs/clear commands` | 人和 AI 都不用手写 HTTP URL |
| 4 | `feat: generate compact AI debug bundle` | 给 AI 一份小而准的上下文 |
| 5 | `feat: add unified device log timeline` | 按时间串起多类日志 |
| 6 | `feat: add optional redaction rules before export` | 保护 token、headers、body、个人信息 |
| 7 | `feat: identify and label multiple reporting devices` | 多真机不混淆 |
| 8 | `feat: add device log store rotation controls` | 控制文件体积和保留周期 |
| 9 | `feat: replay captured network requests` | 从观察走向复现 |
| 10 | `feat: add MCP clear_app_logs tool` | AI 可清理本地日志上下文 |

## 不做

- 云账号。
- 自研 JS 断点调试器。
- 官方 DevTools 替代品。
- 重桌面客户端。
- 默认脱敏。
- token/auth 专项分析。
- 内置 AI API 调用。

## Release Gate

```bash
npm run typecheck
npm test -- --runInBand --watchman=false
npm run lint
npm pack --dry-run
node bin/debug-toolkit.js --daemon-only
curl http://127.0.0.1:3799/health
```
